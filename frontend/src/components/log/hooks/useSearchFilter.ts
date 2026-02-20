/**
 * useSearchFilter Hook
 * 
 * Manages search query state with debouncing and filter toggles.
 */
import { useState, useEffect, useCallback } from 'preact/hooks';

export interface SearchFilterState {
    /** Current local query (immediate) */
    localQuery: string;
    /** Whether regex mode is enabled */
    useRegex: boolean;
    /** Whether case sensitive search */
    caseSensitive: boolean;
    /** Show only changed values */
    showChangedOnly: boolean;
    /** Highlight mode instead of filter */
    highlightMode: boolean;
}

export interface SearchFilterActions {
    /** Update search query (debounced) */
    setQuery: (query: string) => void;
    /** Toggle regex mode */
    toggleRegex: () => void;
    /** Toggle case sensitivity */
    toggleCaseSensitive: () => void;
    /** Toggle show changed only */
    toggleShowChangedOnly: () => void;
    /** Toggle highlight mode */
    toggleHighlightMode: () => void;
    /** Clear all filters */
    clearFilters: () => void;
}

export interface UseSearchFilterOptions {
    /** Initial search query */
    initialQuery?: string;
    /** Debounce delay in ms */
    debounceMs?: number;
    /** Callback when query changes (debounced) */
    onQueryChange?: (query: string) => void;
    /** Callback when regex toggles */
    onRegexChange?: (enabled: boolean) => void;
    /** Callback when case sensitive toggles */
    onCaseSensitiveChange?: (enabled: boolean) => void;
    /** Callback when show changed only toggles */
    onShowChangedOnlyChange?: (enabled: boolean) => void;
    /** Callback when highlight mode toggles */
    onHighlightModeChange?: (enabled: boolean) => void;
    /** External query value to sync with */
    externalQuery?: string;
}

/**
 * Hook for managing search and filter state with debouncing
 */
export function useSearchFilter(options: UseSearchFilterOptions = {}): {
    state: SearchFilterState;
    actions: SearchFilterActions;
} {
    const {
        initialQuery = '',
        debounceMs = 100,
        onQueryChange,
        onRegexChange,
        onCaseSensitiveChange,
        onShowChangedOnlyChange,
        onHighlightModeChange,
        externalQuery
    } = options;

    const [localQuery, setLocalQuery] = useState(initialQuery);
    const [useRegex, setUseRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [showChangedOnly, setShowChangedOnly] = useState(false);
    const [highlightMode, setHighlightMode] = useState(false);

    // Sync with external query if provided
    useEffect(() => {
        if (externalQuery !== undefined && externalQuery !== localQuery) {
            setLocalQuery(externalQuery);
        }
    }, [externalQuery]);

    // Debounce query changes
    useEffect(() => {
        const handler = setTimeout(() => {
            onQueryChange?.(localQuery);
        }, debounceMs);
        return () => clearTimeout(handler);
    }, [localQuery, debounceMs, onQueryChange]);

    const setQuery = useCallback((query: string) => {
        setLocalQuery(query);
    }, []);

    const toggleRegex = useCallback(() => {
        setUseRegex(prev => {
            const next = !prev;
            onRegexChange?.(next);
            return next;
        });
    }, [onRegexChange]);

    const toggleCaseSensitive = useCallback(() => {
        setCaseSensitive(prev => {
            const next = !prev;
            onCaseSensitiveChange?.(next);
            return next;
        });
    }, [onCaseSensitiveChange]);

    const toggleShowChangedOnly = useCallback(() => {
        setShowChangedOnly(prev => {
            const next = !prev;
            onShowChangedOnlyChange?.(next);
            return next;
        });
    }, [onShowChangedOnlyChange]);

    const toggleHighlightMode = useCallback(() => {
        setHighlightMode(prev => {
            const next = !prev;
            onHighlightModeChange?.(next);
            return next;
        });
    }, [onHighlightModeChange]);

    const clearFilters = useCallback(() => {
        setLocalQuery('');
        setUseRegex(false);
        setCaseSensitive(false);
        setShowChangedOnly(false);
        setHighlightMode(false);
        onQueryChange?.('');
        onRegexChange?.(false);
        onCaseSensitiveChange?.(false);
        onShowChangedOnlyChange?.(false);
        onHighlightModeChange?.(false);
    }, [onQueryChange, onRegexChange, onCaseSensitiveChange, onShowChangedOnlyChange, onHighlightModeChange]);

    const state: SearchFilterState = {
        localQuery,
        useRegex,
        caseSensitive,
        showChangedOnly,
        highlightMode
    };

    const actions: SearchFilterActions = {
        setQuery,
        toggleRegex,
        toggleCaseSensitive,
        toggleShowChangedOnly,
        toggleHighlightMode,
        clearFilters
    };

    return { state, actions };
}

export default useSearchFilter;
