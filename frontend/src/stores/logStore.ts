import { signal, computed, effect } from '@preact/signals';
import { startParse, getParseStatus, getParseEntries, streamParseEntries, getParseCategories } from '../api/client';
import type { LogEntry, ParseSession } from '../models/types';
import { saveSession, getSessions } from '../utils/persistence';
import { selectedSignals } from './selectionStore';

export const currentSession = signal<ParseSession | null>(null);
export const logEntries = signal<LogEntry[]>([]);
export const totalEntries = signal(0);
export const isLoadingLog = signal(false);
export const logError = signal<string | null>(null);

// Streaming progress (0-100) - shows progress when loading large files via SSE
export const streamProgress = signal(0);
export const isStreaming = signal(false);

// Polling control - to cancel ongoing polling when session changes
let currentPollAbortController: AbortController | null = null;

// Server-side caching to prevent jumps during scrolling
interface PageCache {
    page: number;
    entries: LogEntry[];
    timestamp: number;
    filterKey: string; // Include filters in cache key
}
const serverPageCache = new Map<string, PageCache>();
const CACHE_MAX_SIZE = 10; // Keep last 10 pages in memory

// Generate cache key from page and filters
function getCacheKey(page: number, filters: any): string {
    const filterKey = JSON.stringify(filters);
    return `${page}:${filterKey}`;
}

// Selected log entry time - used for bookmarking from Log Table view
export const selectedLogTime = signal<number | null>(null);

// Sorting and Filtering
export const sortColumn = signal<keyof LogEntry | null>('timestamp');
export const sortDirection = signal<'asc' | 'desc'>('asc');
export const searchQuery = signal('');
export const searchRegex = signal(false);
export const searchCaseSensitive = signal(false);
export const showChangedOnly = signal(false);

// Category filter - Set of selected categories (empty = show all)
// NOTE: Initialized with all categories, will be cleared after categories are loaded
// to achieve "start with none checked" behavior while showing all entries initially
export const categoryFilter = signal<Set<string>>(new Set());
export const allCategories = signal<string[]>([]);

// Layout - View types matching desktop reference
export type ViewType = 'home' | 'log-table' | 'waveform' | 'map-viewer' | 'transitions';
export const openViews = signal<ViewType[]>(['home']);
export const activeTab = signal<ViewType>('home');
export const signalTypeFilter = signal<string | null>(null);

// View management functions
export function openView(viewType: ViewType) {
    if (!openViews.value.includes(viewType)) {
        openViews.value = [...openViews.value, viewType];
    }
    activeTab.value = viewType;
}

export function closeView(viewType: ViewType) {
    if (viewType === 'home') return; // Cannot close home
    openViews.value = openViews.value.filter(v => v !== viewType);
    // Switch to last open view or home
    if (activeTab.value === viewType) {
        const remaining = openViews.value;
        activeTab.value = remaining[remaining.length - 1] || 'home';
    }
}

// Sync
export const isSyncEnabled = signal(false);
export const syncScrollTop = signal(0);

export function clearSession() {
    // Abort any ongoing polling first
    if (currentPollAbortController) {
        currentPollAbortController.abort();
        currentPollAbortController = null;
    }
    currentSession.value = null;
    logEntries.value = [];
    totalEntries.value = 0;
    isLoadingLog.value = false;
    logError.value = null;
    // Note: waveformStore and others might have their own cleanup triggered by currentSession change
}

export const isParsing = computed(() =>
    currentSession.value?.status === 'parsing' || currentSession.value?.status === 'pending'
);

// Available categories - fetched from backend for all modes
// This ensures all categories from the file are available for filtering,
// not just categories from currently loaded entries
export const availableCategories = computed(() => {
    return allCategories.value;
});

// 2.05 Filter by Selected Signals (Waveform Selection)
// Implicit mode: If signals are selected, filter to them. If empty, show all.

// LARGE FILE OPTIMIZATION:
// If entry count > 100k, use server-side filtering/sorting instead of computed local filters.
export const useServerSide = computed(() => (currentSession.value?.entryCount ?? 0) > 100000);

export const filteredEntries = computed(() => {
    // In server-side mode, logEntries already contains the filtered result from backend
    if (useServerSide.value) {
        return logEntries.value;
    }

    // 1. Selection Filter (Implicit: if selected, filter. If empty, show all)
    const selected = new Set(selectedSignals.value);
    let entries = logEntries.value;

    if (selected.size > 0) {
        entries = entries.filter(e => selected.has(`${e.deviceId}::${e.signalName}`));
    }

    // 2. Filter by Category
    // When categories are selected, show only matching entries
    // When no categories are selected (empty Set), show all entries (no filter)
    const catFilter = categoryFilter.value;
    if (catFilter.size > 0) {
        entries = entries.filter(e => catFilter.has(e.category || ''));
    }


    // 3. Filter by Signal Type (cheap filter, do early)
    if (signalTypeFilter.value) {
        entries = entries.filter(e => e.signalType === signalTypeFilter.value);
    }

    // 4. Filter "Show Changed Only" 
    // NOTE: Backend returns entries sorted by timestamp, so change detection is accurate
    // We only create the Map when this filter is enabled
    if (showChangedOnly.value) {
        const lastValues = new Map<string, string | number | boolean>();
        entries = entries.filter(e => {
            const key = `${e.deviceId}::${e.signalName}`;
            const lastVal = lastValues.get(key);
            const isChanged = lastVal === undefined || lastVal !== e.value;
            lastValues.set(key, e.value);
            return isChanged;
        });
    }

    // 5. Search Filter
    if (searchQuery.value) {
        let matcher: (text: string) => boolean;

        if (searchRegex.value) {
            try {
                const flags = searchCaseSensitive.value ? '' : 'i';
                const regex = new RegExp(searchQuery.value, flags);
                matcher = (text) => regex.test(text);
            } catch {
                matcher = (text) => text.toLowerCase().includes(searchQuery.value.toLowerCase());
            }
        } else {
            const query = searchCaseSensitive.value ? searchQuery.value : searchQuery.value.toLowerCase();
            matcher = (text) => {
                const target = searchCaseSensitive.value ? text : text.toLowerCase();
                return target.includes(query);
            };
        }

        entries = entries.filter(e =>
            matcher(e.signalName) ||
            matcher(e.deviceId) ||
            matcher(e.value.toString())
        );
    }

    // 6. Final Sort (User selection) - only sort once at the end
    if (sortColumn.value) {
        const col = sortColumn.value;
        const dir = sortDirection.value === 'asc' ? 1 : -1;
        // Create a shallow copy for sorting to avoid mutating the filtered reference
        entries = [...entries].sort((a, b) => {
            const valA = a[col] ?? '';
            const valB = b[col] ?? '';
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });
    }

    return entries;
});

// Automatic persistence whenever session changes
effect(() => {
    if (currentSession.value) {
        saveSession(currentSession.value);
    }
});

// Trigger server-side fetch when filters/sort change in server-side mode
effect(() => {
    if (useServerSide.value && currentSession.value?.status === 'complete') {
        // Track dependencies - these are read to trigger the effect when they change
        const search = searchQuery.value;
        const category = categoryFilter.value;
        sortColumn.value;
        sortDirection.value;
        signalTypeFilter.value;

        // Clear cache when filters change
        console.log('[filter effect] Filters changed, clearing cache. Search:', search, 'Category:', Array.from(category));
        serverPageCache.clear();

        // Debounce fetch slightly
        const timer = setTimeout(() => {
            console.log('[filter effect] Triggering fetch for page 1');
            fetchEntries(1, SERVER_PAGE_SIZE); // Back to page 1 on filter change
        }, 100);
        return () => clearTimeout(timer);
    }
});

// Constants for pagination
const SERVER_PAGE_SIZE = 200; // Match the LogTable constant

export async function initLogStore() {
    try {
        const sessions = await getSessions();
        if (sessions.length > 0) {
            // Pick the most recent session
            const lastSession = sessions[sessions.length - 1];
            currentSession.value = lastSession;

            if (lastSession.status === 'complete') {
                handleSessionComplete(lastSession);
            } else if (lastSession.status === 'parsing' || lastSession.status === 'pending') {
                // Resume polling for restored session
                currentPollAbortController = new AbortController();
                pollStatus(lastSession.id, currentPollAbortController.signal);
            }
        }
    } catch (err) {
        console.error('Failed to init log store', err);
    }
}

export async function startParsing(fileId: string) {
    try {
        // Abort any existing polling before starting new session
        if (currentPollAbortController) {
            currentPollAbortController.abort();
        }
        // Create new abort controller for this session
        currentPollAbortController = new AbortController();

        logError.value = null;
        isLoadingLog.value = true;

        const session = await startParse(fileId);
        currentSession.value = session;

        if (session.status === 'complete') {
            handleSessionComplete(session);
        } else {
            // Start polling for status (reliable, works with all setups)
            pollStatus(session.id, currentPollAbortController.signal);
        }
    } catch (err) {
        logError.value = (err as Error).message;
        isLoadingLog.value = false;
    }
}

async function pollStatus(sessionId: string, abortSignal: AbortSignal) {
    // Check if aborted before starting
    if (abortSignal.aborted) return;

    const poll = async () => {
        // Check if aborted before each poll
        if (abortSignal.aborted) {
            return;
        }

        try {
            const session = await getParseStatus(sessionId);

            // Check again after async call in case it was aborted during the request
            if (abortSignal.aborted) {
                return;
            }

            // Only update if it's the current session
            if (currentSession.value?.id === sessionId) {
                currentSession.value = session;
            }

            if (session.status === 'complete') {
                handleSessionComplete(session);
                return;
            }

            if (session.status === 'error') {
                logError.value = session.errors?.[0]?.reason || 'Parsing failed';
                isLoadingLog.value = false;
                return;
            }

            // Schedule next poll, but check if aborted before setting timeout
            if (!abortSignal.aborted) {
                setTimeout(poll, 1000);
            }
        } catch (err: any) {
            if (abortSignal.aborted) {
                // Aborted during request, just stop
                return;
            }
            if (err.status === 404) {
                console.warn('Session not found on server, clearing local state');
                clearSession();
            } else {
                logError.value = (err as Error).message;
                isLoadingLog.value = false;
            }
        }
    };

    poll();
}

/**
 * Handles all logic when a parsing session is complete or loaded.
 * Centralizes data fetching, metadata loading, and view updates.
 */
async function handleSessionComplete(session: ParseSession) {
    isLoadingLog.value = false;

    // Fetch all categories from backend for both modes
    // This ensures all categories are available for filtering, not just from loaded entries
    getParseCategories(session.id)
        .then(cats => {
            allCategories.value = cats;
            // Categories are now available but filter starts empty (none checked)
            // This gives "start with none checked" while showing all entries (empty filter = no filtering)
        })
        .catch(err => console.error('Failed to fetch categories:', err));

    // 1. Initial Data Load
    if (useServerSide.value) {
        // Large file: Fetch first page (server-side pagination mode)
        await fetchEntries(1, 100);
    } else {
        // Client-side mode: Use streaming to load ALL entries
        // Streaming has no 1000 entry limit, unlike the paginated API
        isStreaming.value = true;
        streamProgress.value = 0;
        logEntries.value = [];

        streamParseEntries(
            session.id,
            (batch, progress, total) => {
                logEntries.value = [...logEntries.value, ...batch];
                streamProgress.value = progress;
                totalEntries.value = total;
            },
            async (total) => {
                isStreaming.value = false;
                streamProgress.value = 100;
                totalEntries.value = total;
                finalizeSessionLoad(session);
            },
            (error) => {
                isStreaming.value = false;
                logError.value = error;
            }
        );
        return; // finalizeSessionLoad will be called by streaming completion
    }

    finalizeSessionLoad(session);
}

/**
 * Common finalization tasks for a loaded session
 */
async function finalizeSessionLoad(session: ParseSession) {
    // 2. Trigger map and view updates
    const mapStore = await import('./mapStore');
    mapStore.updateSignalValues(logEntries.value);

    // 3. Set playback time range from session metadata (preferred)
    if (session.startTime && session.endTime) {
        mapStore.setPlaybackRange(session.startTime, session.endTime);
    } else if (logEntries.value.length > 0) {
        // Fallback: Set from available entries
        const timestamps = logEntries.value
            .map(e => e.timestamp ? new Date(e.timestamp).getTime() : null)
            .filter((t): t is number => t !== null && !isNaN(t));
        if (timestamps.length > 0) {
            const startTime = Math.min(...timestamps);
            const endTime = Math.max(...timestamps);
            mapStore.setPlaybackRange(startTime, endTime);
        }
    }
}


export async function fetchEntries(page: number, pageSize: number) {
    if (!currentSession.value || currentSession.value.status !== 'complete') return;

    // Prepare filters for server-side mode
    const filters = useServerSide.value ? {
        search: searchQuery.value,
        category: Array.from(categoryFilter.value)[0] || undefined,
        sort: sortColumn.value || undefined,
        order: sortDirection.value,
        type: signalTypeFilter.value || undefined
    } : undefined;

    const cacheKey = useServerSide.value ? getCacheKey(page, filters) : String(page);

    // DEBUG: Log cache operation
    if (useServerSide.value) {
        console.log('[fetchEntries] page:', page, 'filters:', filters, 'cacheKey:', cacheKey, 'cacheSize:', serverPageCache.size);
    }

    // Check cache first for server-side mode
    if (useServerSide.value) {
        const cached = serverPageCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 30000) { // 30s cache
            console.log('[fetchEntries] Using cached data for key:', cacheKey);
            logEntries.value = cached.entries;
            // Still update total from server response
            return;
        }
    }

    try {
        // Always show loading for initial fetch or when entries are empty
        const isInitialFetch = logEntries.value.length === 0;
        if (!useServerSide.value || isInitialFetch) {
            isLoadingLog.value = true;
        }

        console.log('[fetchEntries] Fetching from server - page:', page, 'filters:', filters);
        const res = await getParseEntries(currentSession.value.id, page, pageSize, filters);
        console.log('[fetchEntries] Server returned:', res.entries.length, 'entries, total:', res.total);

        // In server-side mode, update cache
        if (useServerSide.value) {
            serverPageCache.set(cacheKey, {
                page,
                entries: res.entries as LogEntry[],
                timestamp: Date.now(),
                filterKey: JSON.stringify(filters)
            });
            
            // Prune old cache entries
            if (serverPageCache.size > CACHE_MAX_SIZE) {
                const oldest = Array.from(serverPageCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
                if (oldest) serverPageCache.delete(oldest[0]);
            }
        }

        logEntries.value = res.entries as LogEntry[];
        totalEntries.value = res.total;

        // Update map store with latest values (debounced in mapStore)
        const mapStore = await import('./mapStore');
        mapStore.updateSignalValues(logEntries.value);
    } catch (err: any) {
        if (err.status === 404) {
            console.warn('Session not found on server during fetchEntries, clearing local state');
            clearSession();
        } else {
            logError.value = (err as Error).message;
        }
    } finally {
        isLoadingLog.value = false;
    }
}

/**
 * Fetches all entries for a session. 
 * Used by Map Viewer to ensure full signal history is available.
 */
export async function fetchAllEntries(sessionId: string): Promise<LogEntry[]> {
    try {
        isLoadingLog.value = true;
        // Fetch with a large page size. 
        // Backend handles this by returning all records if pageSize is large.
        const res = await getParseEntries(sessionId, 1, 1000000);
        return res.entries as LogEntry[];
    } catch (err: any) {
        console.error('Failed to fetch all entries:', err);
        throw err;
    } finally {
        isLoadingLog.value = false;
    }
}

// Debugging - extend window interface for dev tools
declare global {
    interface Window {
        logStore?: typeof logStoreDebug;
    }
}

const logStoreDebug = {
    currentSession,
    logEntries,
    totalEntries,
    isLoadingLog,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    isSyncEnabled
};

if (typeof window !== 'undefined') {
    window.logStore = logStoreDebug;
}
