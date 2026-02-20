/**
 * Log Store State
 * 
 * All signals and computed values for log functionality.
 */

import { signal, computed } from '@preact/signals';
import type { LogEntry, ParseSession, ViewType, ServerPageCache, FetchFilters } from './types';
import { selectedSignals } from '../selectionStore';


// ======================
// Session State
// ======================
export const currentSession = signal<ParseSession | null>(null);
export const logEntries = signal<LogEntry[]>([]);
export const totalEntries = signal(0);
export const serverPageOffset = signal(0);
export const isLoadingLog = signal(false);
export const logError = signal<string | null>(null);

// ======================
// Streaming State
// ======================
export const streamProgress = signal(0);
export const isStreaming = signal(false);

// ======================
// Polling & Fetch Control
// ======================
export let currentPollAbortController: AbortController | null = null;
export let currentFetchAbortController: AbortController | null = null;

export function setPollAbortController(controller: AbortController | null): void {
    currentPollAbortController = controller;
}

export function setFetchAbortController(controller: AbortController | null): void {
    currentFetchAbortController = controller;
}

// ======================
// Server-Side Cache
// ======================
export const serverPageCache = new Map<string, ServerPageCache>();
export const CACHE_MAX_SIZE = 10;

export function getCacheKey(page: number, filters?: FetchFilters): string {
    const filterKey = JSON.stringify(filters);
    return `${page}:${filterKey}`;
}

export function clearServerCache(): void {
    serverPageCache.clear();
}

// ======================
// Selection State
// ======================
export const selectedLogTime = signal<number | null>(null);

// ======================
// Sorting & Filtering State
// ======================
export const sortColumn = signal<keyof LogEntry | null>('timestamp');
export const sortDirection = signal<'asc' | 'desc'>('asc');
export const searchQuery = signal('');
export const searchRegex = signal(false);
export const searchCaseSensitive = signal(false);
export const showChangedOnly = signal(false);
export const searchHighlightMode = signal(false);

// Category filter - Set of selected categories
export const categoryFilter = signal<Set<string>>(new Set());
export const allCategories = signal<string[]>([]);

// ======================
// View State
// ======================
export const openViews = signal<ViewType[]>(['home']);
export const activeTab = signal<ViewType>('home');
export const signalTypeFilter = signal<string | null>(null);

// ======================
// Sync State
// ======================
export const isSyncEnabled = signal(false);
export const syncScrollTop = signal(0);

// ======================
// Constants
// ======================
export const SERVER_PAGE_SIZE = 200;
export const LARGE_FILE_THRESHOLD = 100000;

// ======================
// Computed Values
// ======================

export const isParsing = computed(() =>
    currentSession.value?.status === 'parsing' || currentSession.value?.status === 'pending'
);

export const useServerSide = computed(() =>
    (currentSession.value?.entryCount ?? 0) > LARGE_FILE_THRESHOLD
);

export const availableCategories = computed(() => allCategories.value);

export const filteredEntries = computed(() => {
    let entries = logEntries.value;

    // In server-side mode, backend handles search/category/sort/type/signals
    if (useServerSide.value) {
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

    // --- Client-side mode ---

    // 1. Selection Filter (from selectionStore)
    const selected = new Set(selectedSignals.value);
    if (selected.size > 0) {
        entries = entries.filter(e => selected.has(`${e.deviceId}::${e.signalName}`));
    }

    // 2. Category Filter
    const catFilter = categoryFilter.value;
    if (catFilter.size > 0) {
        entries = entries.filter(e => catFilter.has(e.category || ''));
    }

    // 3. Signal Type Filter
    if (signalTypeFilter.value) {
        entries = entries.filter(e => e.signalType === signalTypeFilter.value);
    }

    // 4. Show Changed Only
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
    if (searchQuery.value && !searchHighlightMode.value) {
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

    // 6. Final Sort
    if (sortColumn.value) {
        const col = sortColumn.value;
        const dir = sortDirection.value === 'asc' ? 1 : -1;
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
