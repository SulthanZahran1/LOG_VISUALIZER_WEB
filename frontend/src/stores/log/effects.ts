/**
 * Log Store Effects
 * 
 * Side effects for log functionality.
 */

import { effect } from '@preact/signals';
import {
    currentSession,
    useServerSide, clearServerCache,
    searchQuery, categoryFilter, sortColumn, sortDirection,
    signalTypeFilter, searchRegex, searchCaseSensitive,
    SERVER_PAGE_SIZE
} from './state';
import { selectedSignals } from '../selectionStore';
import { saveSession } from '../../utils/persistence';
import { fetchEntries } from './actions';

/**
 * Effect: Persist session changes
 */
export function initPersistenceEffect(): void {
    effect(() => {
        if (currentSession.value) {
            saveSession(currentSession.value);
        }
    });
}

/**
 * Effect: Trigger server-side fetch when filters/sort change
 */
export function initFilterChangeEffect(): void {
    effect(() => {
        if (useServerSide.value && currentSession.value?.status === 'complete') {
            // Track dependencies
            const search = searchQuery.value;
            const category = categoryFilter.value;
            sortColumn.value;
            sortDirection.value;
            signalTypeFilter.value;
            searchRegex.value;
            searchCaseSensitive.value;
            selectedSignals.value;

            // Clear cache when filters change
            console.log('[filter effect] Filters changed, clearing cache. Search:', search, 'Category:', Array.from(category));
            clearServerCache();

            // Debounce fetch
            const timer = setTimeout(() => {
                console.log('[filter effect] Triggering fetch for page 1');
                fetchEntries(1, SERVER_PAGE_SIZE);
            }, 100);
            return () => clearTimeout(timer);
        }
    });
}

/**
 * Initialize all log store effects.
 */
export function initLogEffects(): void {
    initPersistenceEffect();
    initFilterChangeEffect();
}
