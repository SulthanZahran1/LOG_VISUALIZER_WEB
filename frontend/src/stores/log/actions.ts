/**
 * Log Store Actions
 * 
 * Action functions for log operations.
 */

import { streamParseEntries, getParseCategories } from '../../api/client';
import type { LogEntry, ParseSession } from '../../models/types';
// saveSession is used via dynamic import in finalizeSessionLoad
import {
    currentSession, logEntries, totalEntries, serverPageOffset,
    isLoadingLog, logError, streamProgress, isStreaming,
    setPollAbortController, setFetchAbortController,
    serverPageCache, getCacheKey, CACHE_MAX_SIZE,
    allCategories, sortColumn, sortDirection, searchQuery, categoryFilter,
    signalTypeFilter, searchRegex, searchCaseSensitive,
    SERVER_PAGE_SIZE, openViews, activeTab, useServerSide,
    currentPollAbortController, currentFetchAbortController,
    filteredEntries as filteredComputed
} from './state';
import { selectedSignals } from '../selectionStore';
import type { FetchFilters } from './types';

// Track last initialized session for range reset (managed by effects)

// ======================
// View Management
// ======================

export function openView(viewType: 'home' | 'log-table' | 'waveform' | 'map-viewer' | 'transitions'): void {
    if (!openViews.value.includes(viewType)) {
        openViews.value = [...openViews.value, viewType];
    }
    activeTab.value = viewType;
}

export function closeView(viewType: 'home' | 'log-table' | 'waveform' | 'map-viewer' | 'transitions'): void {
    if (viewType === 'home') return;
    openViews.value = openViews.value.filter(v => v !== viewType);
    if (activeTab.value === viewType) {
        const remaining = openViews.value;
        activeTab.value = remaining[remaining.length - 1] || 'home';
    }
}

// ======================
// Session Management
// ======================

export function clearSession(): void {
    const ctrl = currentPollAbortController;
    if (ctrl) {
        ctrl.abort();
        setPollAbortController(null);
    }
    currentSession.value = null;
    logEntries.value = [];
    totalEntries.value = 0;
    serverPageOffset.value = 0;
    isLoadingLog.value = false;
    logError.value = null;
}

export function setupSessionWithPolling(session: ParseSession): void {
    const ctrl = currentPollAbortController;
    if (ctrl) {
        ctrl.abort();
    }
    setPollAbortController(new AbortController());

    currentSession.value = session;

    if (session.status === 'complete') {
        handleSessionComplete(session);
    } else {
        pollStatus(session.id, currentPollAbortController!.signal);
    }
}

export async function startParsing(fileId: string): Promise<void> {
    try {
        logError.value = null;
        isLoadingLog.value = true;
        const { startParse } = await import('../../api/client');
        const session = await startParse(fileId);
        setupSessionWithPolling(session);
    } catch (err) {
        logError.value = (err as Error).message;
        isLoadingLog.value = false;
    }
}

export function startSessionPolling(session: ParseSession): void {
    logError.value = null;
    isLoadingLog.value = true;
    setupSessionWithPolling(session);
}

// ======================
// Polling
// ======================

async function pollStatus(sessionId: string, abortSignal: AbortSignal): Promise<void> {
    if (abortSignal.aborted) return;

    const poll = async () => {
        if (abortSignal.aborted) return;

        const { getParseStatus } = await import('../../api/client');
        try {
            const session = await getParseStatus(sessionId);

            if (abortSignal.aborted) return;

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

            if (!abortSignal.aborted) {
                setTimeout(poll, 1000);
            }
        } catch (err: any) {
            if (abortSignal.aborted) return;
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

// ======================
// Session Completion
// ======================

async function handleSessionComplete(session: ParseSession): Promise<void> {
    isLoadingLog.value = false;

    // Fetch all categories
    getParseCategories(session.id)
        .then(cats => {
            allCategories.value = cats;
        })
        .catch(err => console.error('Failed to fetch categories:', err));

    // Load data
    if (useServerSide.value) {
        const { fetchEntries } = await import('./actions');
        await fetchEntries(1, SERVER_PAGE_SIZE);
    } else {
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
        return;
    }

    finalizeSessionLoad(session);
}

async function finalizeSessionLoad(session: ParseSession): Promise<void> {
    const mapStore = await import('../mapStore');

    await Promise.all([
        mapStore.fetchMapLayout(),
        mapStore.fetchMapRules(),
    ]);

    await mapStore.linkSignalLogSession(
        session.id,
        session.fileId || 'Session',
        logEntries.value,
        session.startTime,
        session.endTime,
        session.entryCount
    );
}

// ======================
// Data Fetching
// ======================

export async function fetchEntries(page: number, pageSize: number): Promise<void> {
    if (!currentSession.value || currentSession.value.status !== 'complete') return;
    const { getParseEntries } = await import('../../api/client');

    const filters: FetchFilters | undefined = useServerSide.value ? {
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

    // Check cache
    if (useServerSide.value) {
        const cached = serverPageCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 30000) {
            console.log('[fetchEntries] Using cached data for key:', cacheKey);
            logEntries.value = cached.entries;
            serverPageOffset.value = (page - 1) * pageSize;
            return;
        }
    }

    // Abort any in-flight fetch
    if (currentFetchAbortController) {
        currentFetchAbortController.abort();
    }
    const fetchController = new AbortController();
    setFetchAbortController(fetchController);

    try {
        const isInitialFetch = logEntries.value.length === 0;
        if (!useServerSide.value || isInitialFetch) {
            isLoadingLog.value = true;
        }

        console.log('[fetchEntries] Fetching from server - page:', page, 'filters:', filters);
        const res = await getParseEntries(
            currentSession.value.id,
            page,
            pageSize,
            filters,
            fetchController.signal
        );

        if (fetchController !== currentFetchAbortController) return;

        console.log('[fetchEntries] Server returned:', res.entries.length, 'entries, total:', res.total);

        if (useServerSide.value) {
            serverPageCache.set(cacheKey, {
                page,
                entries: res.entries as LogEntry[],
                timestamp: Date.now(),
                filterKey: JSON.stringify(filters)
            });

            if (serverPageCache.size > CACHE_MAX_SIZE) {
                const oldest = Array.from(serverPageCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
                if (oldest) serverPageCache.delete(oldest[0]);
            }
        }

        logEntries.value = res.entries as LogEntry[];
        totalEntries.value = res.total;
        serverPageOffset.value = (page - 1) * pageSize;
    } catch (err: any) {
        if (err?.name === 'AbortError' || fetchController !== currentFetchAbortController) return;
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

export async function fetchAllEntries(sessionId: string): Promise<LogEntry[]> {
    const { getParseEntries } = await import('../../api/client');
    try {
        isLoadingLog.value = true;
        const res = await getParseEntries(sessionId, 1, 1000000);
        return res.entries as LogEntry[];
    } catch (err: any) {
        console.error('Failed to fetch all entries:', err);
        throw err;
    } finally {
        isLoadingLog.value = false;
    }
}

// ======================
// Time Navigation
// ======================

export async function jumpToTime(timestamp: number): Promise<number | null> {
    const { getIndexOfTime } = await import('../../api/client');
    if (!currentSession.value) return null;

    if (useServerSide.value) {
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

            const page = Math.floor(index / SERVER_PAGE_SIZE) + 1;
            await fetchEntries(page, SERVER_PAGE_SIZE);

            return index;
        } catch (err) {
            console.error('Failed to jump to time (server-side):', err);
            return null;
        }
    } else {
        // Client-side: get entries from computed
        const entries = filteredComputed.value;
        if (entries.length === 0) return null;

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
            return entries.findIndex((e: LogEntry) => new Date(e.timestamp).getTime() >= timestamp);
        }
    }
}

// ======================
// Search Utilities
// ======================

export function entryMatchesSearch(entry: LogEntry): boolean {
    if (!searchQuery.value) return false;

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

    return matcher(entry.signalName) ||
        matcher(entry.deviceId) ||
        matcher(entry.value.toString());
}

// ======================
// Initialization
// ======================

export async function initLogStore(): Promise<void> {
    const { getSessions } = await import('../../utils/persistence');

    try {
        const sessions = await getSessions();
        if (sessions.length > 0) {
            const lastSession = sessions[sessions.length - 1];
            currentSession.value = lastSession;

            if (lastSession.status === 'complete') {
                handleSessionComplete(lastSession);
            } else if (lastSession.status === 'parsing' || lastSession.status === 'pending') {
                const ctrl = new AbortController();
                setPollAbortController(ctrl);
                pollStatus(lastSession.id, ctrl.signal);
            }
        }
    } catch (err) {
        console.error('Failed to init log store', err);
    }
}
