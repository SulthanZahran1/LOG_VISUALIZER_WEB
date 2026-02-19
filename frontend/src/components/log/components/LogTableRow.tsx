/**
 * LogTableRow Component
 * 
 * Renders a single row in the log table with proper styling and selection state.
 */
import { memo } from 'preact/compat';
import { formatDateTime } from '../../../utils/TimeAxisUtils';
import type { LogEntry } from '../../../models/types';

export interface LogTableRowProps {
  /** The log entry to display */
  entry: LogEntry;
  /** Row index for selection */
  index: number;
  /** Whether this row is selected */
  isSelected: boolean;
  /** Whether this is an even row (for zebra striping) */
  isEven: boolean;
  /** CSS positioning style */
  style: React.CSSProperties;
  /** Row height */
  rowHeight: number;
  /** Click handler */
  onClick: (e: MouseEvent, index: number) => void;
  /** Search query for highlighting */
  searchQuery?: string;
  /** Whether search uses regex */
  searchRegex?: boolean;
  /** Whether search is case sensitive */
  searchCaseSensitive?: boolean;
  /** Custom color for the row */
  rowColor?: string;
}

/**
 * Single row component for the log table
 * Memoized to prevent unnecessary re-renders during scroll
 */
export const LogTableRow = memo(function LogTableRow({
  entry,
  index,
  isSelected,
  isEven,
  style,
  rowHeight,
  onClick,
  searchQuery,
  rowColor
}: LogTableRowProps) {
  const handleClick = (e: MouseEvent) => {
    onClick(e, index);
  };

  // Build class names
  const classNames = ['log-table-row'];
  if (isSelected) classNames.push('selected');
  if (isEven) classNames.push('even');

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  };

  // Get category display
  const category = entry.category ?? '';

  return (
    <div
      className={classNames.join(' ')}
      style={{
        ...style,
        height: rowHeight,
        backgroundColor: rowColor
      }}
      onClick={handleClick}
      data-index={index}
      data-testid={`log-row-${index}`}
      role="row"
      aria-selected={isSelected}
    >
      <div className="log-table-cell col-timestamp" role="cell">
        {formatDateTime(entry.timestamp)}
      </div>
      <div className="log-table-cell col-device" role="cell">
        {entry.deviceId}
      </div>
      <div className="log-table-cell col-signal" role="cell">
        {entry.signalName}
      </div>
      <div className="log-table-cell col-value" role="cell">
        {formatValue(entry.value)}
      </div>
      <div className="log-table-cell col-type" role="cell">
        {entry.signalType}
      </div>
      <div className="log-table-cell col-category" role="cell">
        {category}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return (
    prevProps.index === nextProps.index &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isEven === nextProps.isEven &&
    prevProps.rowHeight === nextProps.rowHeight &&
    prevProps.rowColor === nextProps.rowColor &&
    prevProps.entry.timestamp === nextProps.entry.timestamp &&
    prevProps.entry.value === nextProps.entry.value
  );
});

export default LogTableRow;
