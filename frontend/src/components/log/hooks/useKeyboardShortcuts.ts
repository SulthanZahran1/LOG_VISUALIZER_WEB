/**
 * useKeyboardShortcuts Hook
 * 
 * Handles keyboard navigation and shortcuts for the log table.
 */
import { useCallback, useRef } from 'preact/hooks';

export interface KeyboardShortcutsConfig {
    /** Total number of entries */
    totalCount: number;
    /** Currently selected index */
    selectedIndex: number | null;
    /** Page size for page up/down */
    pageSize?: number;
    /** Server-side mode */
    serverSide?: boolean;
    /** Current page offset (for server-side) */
    serverPageOffset?: number;
    /** Page length (for server-side) */
    serverPageLength?: number;
    /** Server page size */
    serverPageSize?: number;
    /** Row height for scroll calculations */
    rowHeight?: number;
    /** Scroll scale factor */
    scrollScale?: number;
    /** Callback when selection changes */
    onSelect: (index: number, options?: { range?: boolean; add?: boolean }) => void;
    /** Callback to select all */
    onSelectAll: () => void;
    /** Callback to copy selection */
    onCopy: () => void;
    /** Callback to jump to index (for server-side) */
    onJumpToIndex?: (index: number) => void;
    /** Callback when jump to time triggered */
    onJumpToTime?: () => void;
    /** Ref to scrollable container */
    containerRef?: React.RefObject<HTMLElement>;
}

export interface KeyboardShortcutsActions {
    /** Handle key down event */
    handleKeyDown: (e: KeyboardEvent) => void;
    /** Navigate up */
    navigateUp: (extendSelection?: boolean) => void;
    /** Navigate down */
    navigateDown: (extendSelection?: boolean) => void;
    /** Page up */
    pageUp: (extendSelection?: boolean) => void;
    /** Page down */
    pageDown: (extendSelection?: boolean) => void;
    /** Go to start */
    goToStart: (extendSelection?: boolean) => void;
    /** Go to end */
    goToEnd: (extendSelection?: boolean) => void;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Hook for handling keyboard shortcuts in log table
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): KeyboardShortcutsActions {
    const {
        totalCount,
        selectedIndex,
        pageSize = DEFAULT_PAGE_SIZE,
        serverSide = false,
        serverPageOffset = 0,
        serverPageLength = 0,
        serverPageSize = 200,
        rowHeight = 28,
        scrollScale = 1,
        onSelect,
        onSelectAll,
        onCopy,
        onJumpToIndex,
        onJumpToTime,
        containerRef
    } = config;

    const configRef = useRef(config);
    configRef.current = config;

    const scrollToIndex = useCallback((index: number) => {
        const container = containerRef?.current;
        if (!container) return;

        const scaledRowHeight = rowHeight / scrollScale;
        const rowTop = index * scaledRowHeight;
        const rowBottom = rowTop + scaledRowHeight;

        if (rowTop < container.scrollTop) {
            container.scrollTop = rowTop;
        } else if (rowBottom > container.scrollTop + container.clientHeight) {
            container.scrollTop = rowBottom - container.clientHeight;
        }
    }, [containerRef, rowHeight, scrollScale]);

    const ensureIndexLoaded = useCallback((index: number) => {
        if (!serverSide) return;

        const offset = serverPageOffset;
        const pageLen = serverPageLength;

        if (index < offset || index >= offset + pageLen) {
            const targetPage = Math.floor(index / serverPageSize) + 1;
            onJumpToIndex?.(targetPage);
        }
    }, [serverSide, serverPageOffset, serverPageLength, serverPageSize, onJumpToIndex]);

    const navigateUp = useCallback((extendSelection = false) => {
        if (selectedIndex === null) {
            if (totalCount > 0) onSelect(0);
            return;
        }
        const next = Math.max(0, selectedIndex - 1);
        ensureIndexLoaded(next);
        scrollToIndex(next);
        onSelect(next, { range: extendSelection });
    }, [selectedIndex, totalCount, onSelect, ensureIndexLoaded, scrollToIndex]);

    const navigateDown = useCallback((extendSelection = false) => {
        if (selectedIndex === null) {
            if (totalCount > 0) onSelect(0);
            return;
        }
        const next = Math.min(totalCount - 1, selectedIndex + 1);
        ensureIndexLoaded(next);
        scrollToIndex(next);
        onSelect(next, { range: extendSelection });
    }, [selectedIndex, totalCount, onSelect, ensureIndexLoaded, scrollToIndex]);

    const pageUp = useCallback((extendSelection = false) => {
        if (selectedIndex === null) {
            if (totalCount > 0) onSelect(0);
            return;
        }
        const next = Math.max(0, selectedIndex - pageSize);
        ensureIndexLoaded(next);
        scrollToIndex(next);
        onSelect(next, { range: extendSelection });
    }, [selectedIndex, totalCount, pageSize, onSelect, ensureIndexLoaded, scrollToIndex]);

    const pageDown = useCallback((extendSelection = false) => {
        if (selectedIndex === null) {
            if (totalCount > 0) onSelect(0);
            return;
        }
        const next = Math.min(totalCount - 1, selectedIndex + pageSize);
        ensureIndexLoaded(next);
        scrollToIndex(next);
        onSelect(next, { range: extendSelection });
    }, [selectedIndex, totalCount, pageSize, onSelect, ensureIndexLoaded, scrollToIndex]);

    const goToStart = useCallback((extendSelection = false) => {
        if (totalCount === 0) return;
        ensureIndexLoaded(0);
        scrollToIndex(0);
        onSelect(0, { range: extendSelection });
    }, [totalCount, onSelect, ensureIndexLoaded, scrollToIndex]);

    const goToEnd = useCallback((extendSelection = false) => {
        if (totalCount === 0) return;
        const last = totalCount - 1;
        ensureIndexLoaded(last);
        scrollToIndex(last);
        onSelect(last, { range: extendSelection });
    }, [totalCount, onSelect, ensureIndexLoaded, scrollToIndex]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ctrl+Shift+G: Jump to Time
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
            e.preventDefault();
            onJumpToTime?.();
            return;
        }

        // Ctrl+A: Select all
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            onSelectAll();
            return;
        }

        // Ctrl+C: Copy
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            onCopy();
            return;
        }

        const extendSelection = e.shiftKey;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                navigateUp(extendSelection);
                break;
            case 'ArrowDown':
                e.preventDefault();
                navigateDown(extendSelection);
                break;
            case 'PageUp':
                e.preventDefault();
                pageUp(extendSelection);
                break;
            case 'PageDown':
                e.preventDefault();
                pageDown(extendSelection);
                break;
            case 'Home':
                e.preventDefault();
                goToStart(extendSelection);
                break;
            case 'End':
                e.preventDefault();
                goToEnd(extendSelection);
                break;
            default:
                break;
        }
    }, [navigateUp, navigateDown, pageUp, pageDown, goToStart, goToEnd, onSelectAll, onCopy, onJumpToTime]);

    return {
        handleKeyDown,
        navigateUp,
        navigateDown,
        pageUp,
        pageDown,
        goToStart,
        goToEnd
    };
}

export default useKeyboardShortcuts;
