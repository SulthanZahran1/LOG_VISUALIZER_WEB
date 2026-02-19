/**
 * LogTableRow Component
 * 
 * Renders a single row in the log table with proper styling and selection state.
 */
import { memo } from 'preact/compat';
import { formatDateTime } from '../../../utils/TimeAxisUtils';
import type { LogEntry } from '../../../models/types';
import type { ColorCodingSettings } from '../../../stores/colorCodingStore';
import { HighlightText } from './HighlightText';
import { computeRowColorCoding, entryMatchesSearch } from '../utils/colorCoding';

export interface LogTableRowProps {
    /** The log entry to display */
    entry: LogEntry;
    /** Row index for selection */
    index: number;
    /** Column order */
    columnOrder: string[];
    /** Column widths */
    columnWidths: Record<string, number>;
    /** Whether this row is selected */
    isSelected: boolean;
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
    /** Color settings */
    colorSettings?: ColorCodingSettings;
    /** Mouse down handler */
    onMouseDown?: (index: number, e: MouseEvent) => void;
    /** Context menu handler */
    onContextMenu?: (e: MouseEvent) => void;
}

// Column ID mapping
const COL_ID_MAP: Record<string, string> = {
    timestamp: 'ts',
    deviceId: 'dev',
    signalName: 'sig',
    category: 'cat',
    value: 'val',
    type: 'type'
};

/**
 * Format value for display
 */
function formatValue(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
}

/**
 * Single row component for the log table
 * Memoized to prevent unnecessary re-renders during scroll
 */
export const LogTableRow = memo(function LogTableRow({
    entry,
    index,
    columnOrder,
    columnWidths,
    isSelected,
    searchQuery = '',
    searchRegex = false,
    searchCaseSensitive = false,
    highlightMode = false,
    rowHeight = 28,
    colorSettings,
    onMouseDown,
    onContextMenu
}: LogTableRowProps) {
    const handleMouseDown = (e: MouseEvent) => {
        onMouseDown?.(index, e);
    };

    // Compute color coding
    const colorResult = colorSettings ? computeRowColorCoding(entry, colorSettings) : null;

    // Check if row should be highlighted for search
    const isHighlightMatch = highlightMode && searchQuery && entryMatchesSearch(
        entry,
        searchQuery,
        searchRegex,
        searchCaseSensitive
    );

    // Build class names
    const classNames = ['log-table-row'];
    if (isSelected) classNames.push('selected');
    if (isHighlightMatch) classNames.push('search-highlight');
    if (colorResult?.classes) {
        classNames.push(...colorResult.classes);
    }

    const styles: Record<string, string> = {
        height: `${rowHeight}px`,
        ...(colorResult?.styles || {})
    };

    // Get value class modifiers
    const valueClassMods = colorResult?.valueClassMods || [];

    return (
        <div
            className={classNames.join(' ')}
            style={styles}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
            data-index={index}
            data-testid={`log-row-${index}`}
            role="row"
            aria-selected={isSelected}
        >
            {columnOrder.map((colKey) => {
                const colId = COL_ID_MAP[colKey];
                const width = columnWidths[colId] ?? 100;

                switch (colKey) {
                    case 'timestamp':
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                {formatDateTime(entry.timestamp)}
                            </div>
                        );
                    case 'deviceId':
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                <HighlightText
                                    text={entry.deviceId}
                                    query={searchQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    case 'signalName':
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                <HighlightText
                                    text={entry.signalName}
                                    query={searchQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    case 'category':
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                <HighlightText
                                    text={entry.category || ''}
                                    query={searchQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    case 'value': {
                        const valueStr = formatValue(entry.value);
                        const dataAttr = entry.signalType === 'boolean'
                            ? { 'data-value': valueStr.toLowerCase() }
                            : {};
                        const valueClass = `log-col val-${entry.signalType} ${valueClassMods.join(' ')}`;
                        return (
                            <div key={colKey} className={valueClass} style={{ width }} {...dataAttr}>
                                <HighlightText
                                    text={valueStr}
                                    query={searchQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    }
                    case 'type':
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                {entry.signalType}
                            </div>
                        );
                    default:
                        return null;
                }
            })}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for memo
    const colorSettingsEqual =
        prevProps.colorSettings?.enabled === nextProps.colorSettings?.enabled &&
        prevProps.colorSettings?.mode === nextProps.colorSettings?.mode;

    return (
        prevProps.index === nextProps.index &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.searchQuery === nextProps.searchQuery &&
        prevProps.searchRegex === nextProps.searchRegex &&
        prevProps.searchCaseSensitive === nextProps.searchCaseSensitive &&
        prevProps.highlightMode === nextProps.highlightMode &&
        prevProps.entry.timestamp === nextProps.entry.timestamp &&
        prevProps.entry.value === nextProps.entry.value &&
        colorSettingsEqual
    );
});

export default LogTableRow;
