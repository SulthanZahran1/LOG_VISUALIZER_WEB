/**
 * LogTableRow Component
 * 
 * Renders a single row in the log table with proper styling and selection state.
 */
import { memo } from 'preact/compat';
import { formatDateTime } from '../../../utils/TimeAxisUtils';
import type { LogEntry } from '../../../models/types';
import type { ColorCodingSettings } from '../../../stores/colorCodingStore';
import { getTRSFieldValue } from '../../../utils/trsLog';
import { HighlightText } from './HighlightText';
import type { ColumnKey } from '../hooks/useColumnManagement';
import { computeRowColorCoding } from '../utils/colorCoding';

export interface LogTableRowProps {
    /** The log entry to display */
    entry: LogEntry;
    /** Row index for selection */
    index: number;
    /** Column order */
    columnOrder: ColumnKey[];
    /** Column widths */
    columnWidths: Record<string, number>;
    /** Whether this row is selected */
    isSelected: boolean;
    /** Highlight-only query */
    highlightQuery?: string;
    /** Use regex for search */
    searchRegex?: boolean;
    /** Case sensitive search */
    searchCaseSensitive?: boolean;
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
    type: 'type',
    cmdID: 'cmd',
    status: 'status',
    source: 'src',
    dest: 'dst',
    currLoc: 'loc',
    result: 'res'
};

/**
 * Check whether any visible field in the entry matches the highlight query.
 */
function entryMatchesHighlight(
    entry: LogEntry,
    query: string,
    useRegex: boolean,
    caseSensitive: boolean
): boolean {
    if (!query.trim()) {
        return false;
    }

    const fields = [
        entry.deviceId,
        entry.signalName,
        String(entry.value),
        entry.category || '',
        getTRSFieldValue(entry, 'cmdID'),
        getTRSFieldValue(entry, 'status'),
        getTRSFieldValue(entry, 'source'),
        getTRSFieldValue(entry, 'dest'),
        getTRSFieldValue(entry, 'currLoc'),
        getTRSFieldValue(entry, 'result'),
    ];

    if (useRegex) {
        try {
            const flags = caseSensitive ? '' : 'i';
            const regex = new RegExp(query, flags);
            return fields.some((field) => regex.test(field));
        } catch {
            // Fall through to plain string matching on invalid regex.
        }
    }

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    return fields.some((field) => {
        const normalizedField = caseSensitive ? field : field.toLowerCase();
        return normalizedField.includes(normalizedQuery);
    });
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
    highlightQuery = '',
    searchRegex = false,
    searchCaseSensitive = false,
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

    const isHighlightMatch = entryMatchesHighlight(
        entry,
        highlightQuery,
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
                                    query={highlightQuery}
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
                                    query={highlightQuery}
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
                                    query={highlightQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    case 'value': {
                        const valueStr = String(entry.value);
                        const dataAttr = entry.signalType === 'boolean'
                            ? { 'data-value': valueStr.toLowerCase() }
                            : {};
                        const valueClass = `log-col val-${entry.signalType} ${valueClassMods.join(' ')}`;
                        return (
                            <div key={colKey} className={valueClass} style={{ width }} {...dataAttr}>
                                <HighlightText
                                    text={valueStr}
                                    query={highlightQuery}
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
                    case 'cmdID':
                    case 'status':
                    case 'source':
                    case 'dest':
                    case 'currLoc':
                    case 'result': {
                        const value = getTRSFieldValue(entry, colKey);
                        return (
                            <div key={colKey} className="log-col" style={{ width }}>
                                <HighlightText
                                    text={value}
                                    query={highlightQuery}
                                    useRegex={searchRegex}
                                    caseSensitive={searchCaseSensitive}
                                />
                            </div>
                        );
                    }
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
        prevProps.highlightQuery === nextProps.highlightQuery &&
        prevProps.searchRegex === nextProps.searchRegex &&
        prevProps.searchCaseSensitive === nextProps.searchCaseSensitive &&
        prevProps.columnOrder === nextProps.columnOrder &&
        prevProps.columnWidths === nextProps.columnWidths &&
        prevProps.entry.timestamp === nextProps.entry.timestamp &&
        prevProps.entry.value === nextProps.entry.value &&
        prevProps.entry.category === nextProps.entry.category &&
        prevProps.entry.deviceId === nextProps.entry.deviceId &&
        prevProps.entry.signalName === nextProps.entry.signalName &&
        colorSettingsEqual
    );
});

export default LogTableRow;
