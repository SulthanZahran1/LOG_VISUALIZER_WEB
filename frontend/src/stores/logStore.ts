import { signal, computed, effect } from '@preact/signals';
import { startParse, getParseStatus, getParseEntries } from '../api/client';
import type { LogEntry, ParseSession } from '../models/types';
import { saveSession, getSessions } from '../utils/persistence';
import { selectedSignals } from './selectionStore';

export const currentSession = signal<ParseSession | null>(null);
export const logEntries = signal<LogEntry[]>([]);
export const totalEntries = signal(0);
export const isLoadingLog = signal(false);
export const logError = signal<string | null>(null);

// Sorting and Filtering
export const sortColumn = signal<keyof LogEntry | null>('timestamp');
export const sortDirection = signal<'asc' | 'desc'>('asc');
export const searchQuery = signal('');
export const searchRegex = signal(false);
export const searchCaseSensitive = signal(false);
export const showChangedOnly = signal(false);

// Layout - View types matching desktop reference
export type ViewType = 'home' | 'log-table' | 'waveform' | 'map-viewer';
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

// 2.05 Filter by Selected Signals (Waveform Selection)
// Implicit mode: If signals are selected, filter to them. If empty, show all.
export const filteredEntries = computed(() => {
    let entries = [...logEntries.value];

    // 1. Sort by timestamp first to ensure change detection is accurate
    entries.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
    });

    // 2. Filter "Show Changed Only"
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

    // 3. Selection Filter (Strict)
    const selected = new Set(selectedSignals.value);
    if (selected.size === 0) {
        entries = [];
    } else {
        entries = entries.filter(e => selected.has(`${e.deviceId}::${e.signalName}`));
    }

    // 2.1 Filter by Signal Type
    if (signalTypeFilter.value) {
        entries = entries.filter(e => e.signalType === signalTypeFilter.value);
    }

    // 4. Search Filter
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

    // 5. Final Sort (User selection)
    if (sortColumn.value) {
        const col = sortColumn.value;
        const dir = sortDirection.value === 'asc' ? 1 : -1;
        entries.sort((a, b) => {
            const valA = a[col];
            const valB = b[col];
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

export async function initLogStore() {
    try {
        const sessions = await getSessions();
        if (sessions.length > 0) {
            // Pick the most recent session
            const lastSession = sessions[sessions.length - 1];
            currentSession.value = lastSession;

            if (lastSession.status === 'complete') {
                fetchEntries(1, 1000); // Fetch more for initial view to support filtering
            } else if (lastSession.status === 'parsing' || lastSession.status === 'pending') {
                pollStatus(lastSession.id);
            }
        }
    } catch (err) {
        console.error('Failed to init log store', err);
    }
}

export async function startParsing(fileId: string) {
    try {
        logError.value = null;
        isLoadingLog.value = true;

        const session = await startParse(fileId);
        currentSession.value = session;

        // Start polling for status
        pollStatus(session.id);
    } catch (err) {
        logError.value = (err as Error).message;
        isLoadingLog.value = false;
    }
}

async function pollStatus(sessionId: string) {
    const poll = async () => {
        try {
            const session = await getParseStatus(sessionId);

            // Only update if it's the current session
            if (currentSession.value?.id === sessionId) {
                currentSession.value = session;
            }

            if (session.status === 'complete') {
                isLoadingLog.value = false;
                await fetchEntries(1, 1000000); // Fetch all entries (up to 1M) for full visualization

                // Trigger map update if map viewer is open
                const mapStore = await import('./mapStore');
                mapStore.updateSignalValues(logEntries.value);

                // Set playback time range from session metadata (preferred)
                if (session.startTime && session.endTime) {
                    mapStore.setPlaybackRange(session.startTime, session.endTime);
                } else if (logEntries.value.length > 0) {
                    // Fallback: Set playback time range from log entries
                    const timestamps = logEntries.value
                        .map(e => e.timestamp ? new Date(e.timestamp).getTime() : null)
                        .filter((t): t is number => t !== null && !isNaN(t));
                    if (timestamps.length > 0) {
                        const startTime = Math.min(...timestamps);
                        const endTime = Math.max(...timestamps);
                        mapStore.setPlaybackRange(startTime, endTime);
                    }
                }
                return;
            }

            if (session.status === 'error') {
                logError.value = session.errors?.[0]?.reason || 'Parsing failed';
                isLoadingLog.value = false;
                return;
            }

            setTimeout(poll, 1000);
        } catch (err: any) {
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

export async function fetchEntries(page: number, pageSize: number) {
    if (!currentSession.value || currentSession.value.status !== 'complete') return;

    try {
        isLoadingLog.value = true;
        const res = await getParseEntries(currentSession.value.id, page, pageSize);

        logEntries.value = res.entries as LogEntry[];
        totalEntries.value = res.total;

        // Update map store with latest values
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
