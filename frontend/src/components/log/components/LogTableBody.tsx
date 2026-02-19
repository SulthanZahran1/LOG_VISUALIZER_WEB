/**
 * LogTableBody Component
 * 
 * Renders the scrollable body of the log table with virtualization.
 */
import { useCallback, forwardRef } from 'preact/compat';
import { LogTableRow } from './LogTableRow';
import type { LogEntry } from '../../../models/types';
import type { VirtualScrollState } from '../hooks/useVirtualScroll';

export interface LogTableBodyProps {
  /** Entries to display */
  entries: LogEntry[];
  /** Start index for virtualization */
  startIndex: number;
  /** Total scroll height */
  scrollHeight: number;
  /** Vertical offset for positioning */
  offsetY: number;
  /** Row height */
  rowHeight: number;
  /** Set of selected row indices */
  selectedRows: Set<number>;
  /** Click handler for rows */
  onRowClick: (e: MouseEvent, index: number) => void;
  /** Scroll handler */
  onScroll: (scrollTop: number) => void;
  /** Search query for highlighting */
  searchQuery?: string;
  /** Whether search uses regex */
  searchRegex?: boolean;
  /** Whether search is case sensitive */
  searchCaseSensitive?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Virtualized table body component
 */
export const LogTableBody = forwardRef<HTMLDivElement, LogTableBodyProps>(
  function LogTableBody({
    entries,
    startIndex,
    scrollHeight,
    offsetY,
    rowHeight,
    selectedRows,
    onRowClick,
    onScroll,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    isLoading
  }, ref) {
    // Handle scroll events
    const handleScroll = useCallback((e: Event) => {
      const target = e.target as HTMLDivElement;
      onScroll(target.scrollTop);
    }, [onScroll]);

    // Render loading state
    if (isLoading) {
      return (
        <div className="log-table-body loading" role="region" aria-label="Loading">
          <div className="loading-spinner" />
          <span>Loading entries...</span>
        </div>
      );
    }

    // Render empty state
    if (entries.length === 0) {
      return (
        <div className="log-table-body empty" role="region" aria-label="No entries">
          <span>No entries to display</span>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="log-table-body"
        onScroll={handleScroll}
        role="region"
        aria-label="Log entries"
        tabIndex={0}
      >
        {/* Virtual scroll container */}
        <div
          className="virtual-scroll-container"
          style={{ height: scrollHeight }}
        >
          {/* Visible rows container */}
          <div
            className="visible-rows"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {entries.map((entry, i) => {
              const actualIndex = startIndex + i;
              const isSelected = selectedRows.has(actualIndex);
              const isEven = actualIndex % 2 === 0;

              return (
                <LogTableRow
                  key={`${entry.timestamp}-${entry.deviceId}-${entry.signalName}-${actualIndex}`}
                  entry={entry}
                  index={actualIndex}
                  isSelected={isSelected}
                  isEven={isEven}
                  style={{ position: 'absolute', top: actualIndex * rowHeight }}
                  rowHeight={rowHeight}
                  onClick={onRowClick}
                  searchQuery={searchQuery}
                  searchRegex={searchRegex}
                  searchCaseSensitive={searchCaseSensitive}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);

export default LogTableBody;
