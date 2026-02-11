import { signal, computed, effect } from '@preact/signals';
import { startParse, getParseStatus, getParseEntries, streamParseEntries, getParseCategories, getIndexOfTime } from '../api/client';
import type { LogEntry, ParseSession } from '../models/types';
import { saveSession, getSessions } from '../utils/persistence';
import { selectedSignals } from './selectionStore';

export const currentSession = signal<ParseSession | null>(null);
export const logEntries = signal<LogEntry[]>([]);
export const totalEntries = signal(0);
export const serverPageOffset = signal(0);
export const isLoadingLog = signal(false);
export const logError = signal<string | null>(null);

// Streaming progress (0-100) - shows progress when loading large files via SSE
export const streamProgress = signal(0);
export const isStreaming = signal(false);

// Polling control - to cancel ongoing polling when session changes
let currentPollAbortController: AbortController | null = null;

// Fetch cancellation - abort stale page fetches during rapid scrolling
let currentFetchAbortController: AbortController | null = null;

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
    serverPageOffset.value = 0;
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
    let entries = logEntries.value;

    // In server-side mode, backend handles search/category/sort/type/signals.
    // We still apply showChangedOnly locally on the current page.
    if (useServerSide.value) {
        // Show changed only (applied on current page - approximate but useful)
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

        return entries;
    }

    // --- Client-side mode (< 100k entries) ---

    // 1. Selection Filter (Implicit: if selected, filter. If empty, show all)
    const selected = new Set(selectedSignals.value);
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
        searchRegex.value;
        searchCaseSensitive.value;
        selectedSignals.value; // Track signal selection changes

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

/**
 * Sets up a session and starts polling if needed.
 * Used both for single-file parsing and multi-file merge sessions.
 */
function setupSessionWithPolling(session: ParseSession) {
    // Abort any existing polling before starting new session
    if (currentPollAbortController) {
        currentPollAbortController.abort();
    }
    // Create new abort controller for this session
    currentPollAbortController = new AbortController();

    currentSession.value = session;

    if (session.status === 'complete') {
        handleSessionComplete(session);
    } else {
        // Start polling for status (reliable, works with all setups)
        pollStatus(session.id, currentPollAbortController.signal);
    }
}

export async function startParsing(fileId: string) {
    try {
        logError.value = null;
        isLoadingLog.value = true;

        const session = await startParse(fileId);
        setupSessionWithPolling(session);
    } catch (err) {
        logError.value = (err as Error).message;
        isLoadingLog.value = false;
    }
}

/**
 * Starts polling for an existing session (e.g., after merging files).
 * This handles session setup and polling for sessions created outside startParsing.
 */
export function startSessionPolling(session: ParseSession) {
    logError.value = null;
    isLoadingLog.value = true;
    setupSessionWithPolling(session);
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
        await fetchEntries(1, SERVER_PAGE_SIZE);
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
 * Common finalization tasks for a loaded session.
 * Auto-links the session to the map viewer for playback.
 */
async function finalizeSessionLoad(session: ParseSession) {
    const mapStore = await import('./mapStore');

    // Ensure map layout and rules are loaded so the map viewer can apply
    // coloring rules as soon as signal data arrives.
    await Promise.all([
        mapStore.fetchMapLayout(),
        mapStore.fetchMapRules(),
    ]);

    // Auto-link the session to the map viewer.
    // For large files, linkSignalLogSession triggers server-side fetching via the map effect.
    // For small files, it populates signalHistory from the loaded entries.
    await mapStore.linkSignalLogSession(
        session.id,
        session.fileId || 'Session',
        logEntries.value,
        session.startTime,
        session.endTime,
        session.entryCount
    );
}


export async function fetchEntries(page: number, pageSize: number) {
    if (!currentSession.value || currentSession.value.status !== 'complete') return;

    // Prepare filters for server-side mode
    const filters = useServerSide.value ? {
        search: searchQuery.value,
        category: categoryFilter.value.size > 0
            ? Array.from(categoryFilter.value).join(',')
            : undefined,
        sort: sortColumn.value || undefined,
        order: sortDirection.value,
        type: signalTypeFilter.value || undefined,
        regex: searchRegex.value || undefined,
        caseSensitive: searchCaseSensitive.value || undefined,
        signals: selectedSignals.value.length > 0
            ? selectedSignals.value.join(',')
            : undefined,
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
            serverPageOffset.value = (page - 1) * pageSize;
            return;
        }
    }

    // Abort any in-flight fetch before starting a new one
    if (currentFetchAbortController) {
        currentFetchAbortController.abort();
    }
    currentFetchAbortController = new AbortController();
    const fetchAbortSignal = currentFetchAbortController;

    try {
        // Always show loading for initial fetch or when entries are empty
        const isInitialFetch = logEntries.value.length === 0;
        if (!useServerSide.value || isInitialFetch) {
            isLoadingLog.value = true;
        }

        console.log('[fetchEntries] Fetching from server - page:', page, 'filters:', filters);
        const res = await getParseEntries(currentSession.value.id, page, pageSize, filters, fetchAbortSignal.signal);

        // If this fetch was aborted while in flight, discard results
        if (fetchAbortSignal !== currentFetchAbortController) return;

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
        serverPageOffset.value = (page - 1) * pageSize;

        // NOTE: Do NOT push log table page data to mapStore here.
        // The map viewer fetches its own data via getValuesAtTime based on playback time.
    } catch (err: any) {
        // Ignore aborted fetches (superseded by newer request)
        if (err?.name === 'AbortError' || fetchAbortSignal !== currentFetchAbortController) return;
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

/**
 * Finds the index of the first entry at or after the given timestamp.
 * In server-side mode, it queries the backend.
 * In client-side mode, it searches locally.
 */
export async function jumpToTime(timestamp: number): Promise<number | null> {
    if (!currentSession.value) return null;

    if (useServerSide.value) {
        // Prepare filters for server-side mode
        const filters = {
            search: searchQuery.value,
            category: categoryFilter.value.size > 0
                ? Array.from(categoryFilter.value).join(',')
                : undefined,
            sort: sortColumn.value || undefined,
            order: sortDirection.value,
            type: signalTypeFilter.value || undefined,
            regex: searchRegex.value || undefined,
            caseSensitive: searchCaseSensitive.value || undefined,
            signals: selectedSignals.value.length > 0
                ? selectedSignals.value.join(',')
                : undefined,
        };

        try {
            const index = await getIndexOfTime(currentSession.value.id, timestamp, filters);
            if (index === -1) return null;

            // Jump to the correct page
            const page = Math.floor(index / SERVER_PAGE_SIZE) + 1;
            await fetchEntries(page, SERVER_PAGE_SIZE);

            return index;
        } catch (err) {
            console.error('Failed to jump to time (server-side):', err);
            return null;
        }
    } else {
        // Client-side search
        const entries = filteredEntries.value;
        if (entries.length === 0) return null;

        // Use binary search if sorted by timestamp
        if (sortColumn.value === 'timestamp') {
            const dir = sortDirection.value === 'asc' ? 1 : -1;

            if (dir === 1) {
                let low = 0;
                let high = entries.length - 1;
                let bestIdx = -1;

                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    const midTs = new Date(entries[mid].timestamp).getTime();

                    if (midTs >= timestamp) {
                        bestIdx = mid;
                        high = mid - 1;
                    } else {
                        low = mid + 1;
                    }
                }
                return bestIdx === -1 ? null : bestIdx;
            } else {
                // Descending order: binary search differently
                let low = 0;
                let high = entries.length - 1;
                let bestIdx = -1;

                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    const midTs = new Date(entries[mid].timestamp).getTime();

                    if (midTs <= timestamp) {
                        bestIdx = mid;
                        high = mid - 1;
                    } else {
                        low = mid + 1;
                    }
                }
                return bestIdx === -1 ? null : bestIdx;
            }
        } else {
            // Linear search for other sort columns
            return entries.findIndex(e => new Date(e.timestamp).getTime() >= timestamp);
        }
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
