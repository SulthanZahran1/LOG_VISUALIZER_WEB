/**
 * Log Store
 * 
 * Modular store for log functionality.
 * 
 * Architecture:
 * - state.ts: Signals and computed values
 * - actions.ts: Action functions
 * - effects.ts: Side effects
 * - types.ts: TypeScript interfaces
 * 
 * This index file re-exports everything for backward compatibility.
 */

// ======================
// Types
// ======================
export type {
    ViewType,
    LogEntry,
    ParseSession,
    ServerPageCache,
    FetchFilters
} from './types';

// ======================
// State
// ======================
export {
    // Session
    currentSession,
    logEntries,
    totalEntries,
    serverPageOffset,
    isLoadingLog,
    logError,
    // Streaming
    streamProgress,
    isStreaming,
    // Cache
    serverPageCache,
    CACHE_MAX_SIZE,
    clearServerCache,
    getCacheKey,
    // Selection
    selectedLogTime,
    // Sorting & Filtering
    sortColumn,
    sortDirection,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    searchHighlightMode,
    categoryFilter,
    allCategories,
    // View
    openViews,
    activeTab,
    signalTypeFilter,
    // Sync
    isSyncEnabled,
    syncScrollTop,
    // Constants
    SERVER_PAGE_SIZE,
    LARGE_FILE_THRESHOLD,
    // Computed
    isParsing,
    useServerSide,
    availableCategories,
    filteredEntries
} from './state';

// ======================
// Actions
// ======================
export {
    // View management
    openView,
    closeView,
    // Session management
    clearSession,
    setupSessionWithPolling,
    startParsing,
    startSessionPolling,
    // Data fetching
    fetchEntries,
    fetchAllEntries,
    // Time navigation
    jumpToTime,
    // Search
    entryMatchesSearch,
    // Init
    initLogStore
} from './actions';

// ======================
// Effects
// ======================
export {
    initPersistenceEffect,
    initFilterChangeEffect,
    initLogEffects
} from './effects';
