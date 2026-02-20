/**
 * LogTableViewport Component
 * 
 * The scrollable viewport containing the log rows.
 */
import { forwardRef } from 'preact/compat';
import { useCallback } from 'preact/hooks';
import type { LogEntry } from '../../../models/types';
import type { VirtualScrollState } from '../hooks/useVirtualScroll';
import { LogTableRow } from './LogTableRow';

export interface LogTableViewportProps {
    /** Ref to the scrollable container */
    containerRef: React.RefObject<HTMLDivElement>;
    /** Virtual scroll state */
    virtualState: VirtualScrollState;
    /** Visible entries to render */
    visibleEntries: LogEntry[];
    /** Start index of visible entries */
    startIndex: number;
    /** Set of selected row indices */
    selectedRows: Set<number>;
    /** Column order */
    columnOrder: string[];
    /** Column widths */
    columnWidths: Record<string, number>;
    /** Whether in server-side mode */
    serverSide?: boolean;
    /** Server page offset */
    serverPageOffset?: number;
    /** Search query for highlighting */
    searchQuery?: string;
    /** Use regex for search */
    searchRegex?: boolean;
    /** Case sensitive search */
    searchCaseSensitive?: boolean;
    /** Highlight mode enabled */
    highlightMode?: boolean;
    /** Row height */
    rowHeight?: number;
    /** Scale factor for scroll */
    scrollScale?: number;
    /** Whether loading */
    isLoading?: boolean;
    /** Whether streaming */
    isStreaming?: boolean;
    /** Stream progress percentage */
    streamProgress?: number;
    /** Whether fetching page */
    isFetchingPage?: boolean;
    /** Total count for empty state */
    totalCount?: number;
    /** Handler for row mouse down */
    onRowMouseDown?: (index: number, e: MouseEvent) => void;
    /** Handler for row context menu */
    onRowContextMenu?: (e: MouseEvent) => void;
    /** Handler for scroll */
    onScroll?: (e: Event) => void;
}

const DEFAULT_ROW_HEIGHT = 28;

/**
 * Virtualized table viewport component
 */
export const LogTableViewport = forwardRef<HTMLDivElement, LogTableViewportProps>(
    function LogTableViewport({
        virtualState,
        visibleEntries,
        startIndex,
        selectedRows,
        columnOrder,
        columnWidths,
        serverSide = false,
        serverPageOffset = 0,
        searchQuery = '',
        searchRegex = false,
        searchCaseSensitive = false,
        highlightMode = false,
        rowHeight = DEFAULT_ROW_HEIGHT,
        scrollScale = 1,
        isLoading = false,
        isStreaming = false,
        streamProgress = 0,
        isFetchingPage = false,
        totalCount = 0,
        onRowMouseDown,
        onRowContextMenu,
        onScroll
    }, ref) {
        const handleScroll = useCallback((e: Event) => {
            onScroll?.(e);
        }, [onScroll]);

        // Calculate offset top for positioning
        const offsetTop = serverSide
            ? (serverPageOffset * rowHeight) / scrollScale
            : virtualState.offsetY;

        const totalHeight = virtualState.scrollHeight;

        // Render loading overlay
        if (isLoading || isStreaming) {
            return (
                <div className="log-table-viewport" ref={ref} onScroll={handleScroll}>
                    <div className="log-table-spacer" style={{ height: `${totalHeight}px` }}>
                        <div className="log-table-rows" style={{ transform: `translateY(${offsetTop}px)` }}>
                            {/* Render empty rows while loading */}
                        </div>
                    </div>
                    <div className="log-loading-overlay">
                        <div className="loader"></div>
                        {isStreaming ? (
                            <div className="streaming-progress">
                                <span>Streaming Log Entries... {streamProgress}%</span>
                                <div className="progress-bar-container">
                                    <div className="progress-bar" style={{ width: `${streamProgress}%` }}></div>
                                </div>
                            </div>
                        ) : (
                            <span>Loading Log Data...</span>
                        )}
                    </div>
                </div>
            );
        }

        // Render empty state
        if (!isLoading && totalCount === 0) {
            return (
                <div className="log-table-viewport" ref={ref} onScroll={handleScroll}>
                    <div className="log-empty-state">
                        {searchQuery ? 'No entries match your filter' : 'No entries found'}
                    </div>
                </div>
            );
        }

        return (
            <div className="log-table-viewport" ref={ref} onScroll={handleScroll}>
                <div className="log-table-spacer" style={{ height: `${totalHeight}px` }}>
                    <div className="log-table-rows" style={{ transform: `translateY(${offsetTop}px)` }}>
                        {visibleEntries.map((entry, i) => {
                            const actualIndex = startIndex + i;

                            return (
                                <LogTableRow
                                    key={`${entry.timestamp}-${entry.deviceId}-${entry.signalName}-${actualIndex}`}
                                    entry={entry}
                                    index={actualIndex}
                                    columnOrder={columnOrder}
                                    columnWidths={columnWidths}
                                    isSelected={selectedRows.has(actualIndex)}
                                    searchQuery={searchQuery}
                                    searchRegex={searchRegex}
                                    searchCaseSensitive={searchCaseSensitive}
                                    highlightMode={highlightMode}
                                    rowHeight={rowHeight}
                                    onMouseDown={onRowMouseDown}
                                    onContextMenu={onRowContextMenu}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Page fetching indicator */}
                {serverSide && isFetchingPage && (
                    <div className="log-loading-indicator">
                        <div className="loader-small"></div>
                        <span>Loading more entries...</span>
                    </div>
                )}
            </div>
        );
    }
);

export default LogTableViewport;
