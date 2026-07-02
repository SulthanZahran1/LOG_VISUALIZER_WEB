import { useSignal } from '@preact/signals';
import { useRef, useEffect, useState, useCallback, useMemo } from 'preact/hooks';
import {
    filteredEntries,
    currentSession,
    isLoadingLog,
    sortColumn,
    sortDirection,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    highlightQuery,
    totalEntries,
    fetchEntries,
    useServerSide,
    serverPageOffset,
    openView,
    selectedLogTime,
    isStreaming,
    streamProgress,
    categoryFilter,
    signalNameFilter,
    deviceIdFilter,
    availableCategories,
    availableSignalNames,
    availableDeviceIds,
    jumpToTime,
} from '../../stores/logStore';
import { getTimeTree } from '../../api/client';
import type { TimeTreeEntry } from '../../api/client';
import { toggleSignal } from '../../stores/waveformStore';
import { setPlaybackTime } from '../../stores/mapStore';
import type { SortColumnKey } from '../../stores/log/types';
import { formatDateTime } from '../../utils/TimeAxisUtils';
import type { ParseSession } from '../../models/types';
import { isTransferParser } from '../../utils/trsLog';
import { isSECSParser, parseSECSValue } from '../../utils/secsLog';
import { colorSettings } from '../../stores/colorCodingStore';
import { SignalSidebar } from '../waveform/SignalSidebar';
import { SECSMessageDialog } from '../secs/SECSMessageDialog';

// Components
import { LogTableToolbar } from './components/LogTableToolbar';
import { LogTableViewport } from './components/LogTableViewport';

// Hooks
import {
    useVirtualScroll,
    useRowSelection,
    useColumnManagement,
    useSearchFilter,
    useKeyboardShortcuts,
    DEFAULT_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    type ColumnKey,
    type ColumnDef
} from './hooks';

import './LogTable.css';

const ROW_HEIGHT = 28;
const BUFFER = 15;
const SERVER_PAGE_SIZE = 200;
const MAX_SCROLL_HEIGHT = 15_000_000;

const GENERIC_COLUMNS: ColumnDef[] = [
    { key: 'timestamp', id: 'ts', label: 'TIMESTAMP', sortable: true, resizable: true },
    { key: 'deviceId', id: 'dev', label: 'SOURCE', sortable: true, resizable: true },
    { key: 'signalName', id: 'sig', label: 'LEVEL', sortable: true, resizable: true },
    { key: 'value', id: 'val', label: 'MESSAGE', sortable: false, resizable: true },
];

const GENERIC_COLUMN_ORDER: ColumnKey[] = ['timestamp', 'deviceId', 'signalName', 'value'];

const TRS_COLUMNS: ColumnDef[] = [
    { key: 'timestamp', id: 'ts', label: 'TIMESTAMP', sortable: true, resizable: true },
    { key: 'deviceId', id: 'dev', label: 'CARRIER ID', sortable: true, resizable: true },
    { key: 'cmdID' as ColumnKey, id: 'cmd', label: 'CMD ID', sortable: true, resizable: true },
    { key: 'status' as ColumnKey, id: 'status', label: 'STATUS', sortable: true, resizable: true },
    { key: 'source' as ColumnKey, id: 'src', label: 'SOURCE', sortable: true, resizable: true },
    { key: 'dest' as ColumnKey, id: 'dst', label: 'DEST', sortable: true, resizable: true },
    { key: 'currLoc' as ColumnKey, id: 'loc', label: 'CURR LOC', sortable: true, resizable: true },
    { key: 'result' as ColumnKey, id: 'res', label: 'RESULT', sortable: true, resizable: true },
];

const TRS_COLUMN_ORDER: ColumnKey[] = ['timestamp', 'deviceId', 'cmdID' as ColumnKey, 'status' as ColumnKey, 'source' as ColumnKey, 'dest' as ColumnKey, 'currLoc' as ColumnKey, 'result' as ColumnKey];

const SECS_COLUMNS: ColumnDef[] = [
    { key: 'timestamp', id: 'ts', label: 'TIMESTAMP', sortable: true, resizable: true },
    { key: 'direction' as ColumnKey, id: 'dir', label: 'DIRECTION', sortable: true, resizable: true },
    { key: 'streamFunction' as ColumnKey, id: 'sf', label: 'S/F', sortable: true, resizable: true },
    { key: 'systemByte' as ColumnKey, id: 'sb', label: 'SYSTEM BYTE', sortable: true, resizable: true },
    { key: 'value', id: 'val', label: 'MESSAGE', sortable: false, resizable: true },
];

const SECS_COLUMN_ORDER: ColumnKey[] = ['timestamp', 'direction' as ColumnKey, 'streamFunction' as ColumnKey, 'systemByte' as ColumnKey, 'value'];

function isGenericLogSession(session: ParseSession | null | undefined): boolean {
    return (session as any)?.parserName === 'generic_log';
}

function isTRSLogSession(session: ParseSession | null | undefined): boolean {
    return isTransferParser((session as any)?.parserName);
}

function isSECS2LogSession(session: ParseSession | null | undefined): boolean {
    return isSECSParser((session as any)?.parserName);
}

/** Compute scroll scale factor when virtual height exceeds browser max */
function getScrollScale(): number {
    if (!useServerSide.value) return 1;
    const realTotal = totalEntries.value * ROW_HEIGHT;
    if (realTotal <= MAX_SCROLL_HEIGHT) return 1;
    return realTotal / MAX_SCROLL_HEIGHT;
}

/**
 * Column Filter Popover Component (uses logStore)
 */
type FilterableColumn = 'category' | 'signalName' | 'deviceId';

function ColumnFilterPopoverContainer({ column, onClose }: { column: FilterableColumn; onClose: () => void }) {
    const options = column === 'category'
        ? availableCategories.value
        : column === 'signalName'
            ? availableSignalNames.value
            : availableDeviceIds.value;
    const selectedFilter = column === 'category'
        ? categoryFilter.value
        : column === 'signalName'
            ? signalNameFilter.value
            : deviceIdFilter.value;
    const [localSearchQuery, setLocalSearchQuery] = useState('');

    const filteredOptions = localSearchQuery.trim() === ''
        ? options
        : options.filter(option =>
            (column === 'category' ? (option || '(Uncategorized)') : option)
                .toLowerCase()
                .includes(localSearchQuery.toLowerCase())
        );

    const applyFilter = (nextFilter: Set<string>) => {
        if (column === 'category') {
            categoryFilter.value = nextFilter;
        } else if (column === 'signalName') {
            signalNameFilter.value = nextFilter;
        } else {
            deviceIdFilter.value = nextFilter;
        }
    };

    const handleToggle = (rawValue: string) => {
        const normalizedValue = column === 'category' ? (rawValue ?? '') : rawValue;
        const newFilter = new Set(selectedFilter);
        if (newFilter.has(normalizedValue)) {
            newFilter.delete(normalizedValue);
        } else {
            newFilter.add(normalizedValue);
        }
        applyFilter(newFilter);
    };

    const handleClearAll = () => {
        applyFilter(new Set());
    };

    const popoverRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && e.target instanceof HTMLElement && !popoverRef.current.contains(e.target)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 0);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return (
        <div ref={popoverRef} className="category-filter-popover">
            <div className="popover-header">
                <span>
                    {column === 'category' ? 'Filter by Category' : column === 'signalName' ? 'Filter by Signal Name' : 'Filter by Device ID'}
                </span>
                <div className="popover-actions">
                    <button className="popover-btn" onClick={handleClearAll}>Clear</button>
                </div>
            </div>
            <div className="popover-search">
                <span className="popover-search-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                </span>
                <input
                    type="text"
                    placeholder={column === 'category' ? 'Search categories...' : column === 'signalName' ? 'Search signal names...' : 'Search device IDs...'}
                    value={localSearchQuery}
                    onInput={(e) => setLocalSearchQuery((e.target as HTMLInputElement).value)}
                />
            </div>
            <div className="popover-list">
                {options.length === 0 ? (
                    <div className="popover-empty">
                        {column === 'category' ? 'No categories available' : column === 'signalName' ? 'No signal names available' : 'No device IDs available'}
                    </div>
                ) : filteredOptions.length === 0 ? (
                    <div className="popover-empty">
                        {column === 'category' ? 'No matching categories' : column === 'signalName' ? 'No matching signal names' : 'No matching device IDs'}
                    </div>
                ) : (
                    filteredOptions.map(option => {
                        const normalizedValue = column === 'category' ? (option ?? '') : option;
                        const label = column === 'category' ? (normalizedValue || '(Uncategorized)') : normalizedValue;
                        return (
                            <label key={normalizedValue || '__uncategorized__'} className="filter-item">
                                <input
                                    type="checkbox"
                                    checked={selectedFilter.has(normalizedValue)}
                                    onChange={() => handleToggle(normalizedValue)}
                                />
                                <span className="filter-label">{label}</span>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/**
 * Build time tree for Jump to Time feature
 */
function buildTimeTree(entries: Array<{ timestamp: string | number }>) {
    const tree = new Map<string, Map<number, Map<number, number>>>();
    for (const e of entries) {
        const d = new Date(e.timestamp);
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const hour = d.getUTCHours();
        const minute = d.getUTCMinutes();

        if (!tree.has(dateStr)) tree.set(dateStr, new Map());
        const hours = tree.get(dateStr)!;
        if (!hours.has(hour)) hours.set(hour, new Map());
        const minutes = hours.get(hour)!;
        if (!minutes.has(minute)) minutes.set(minute, typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime());
    }
    return tree;
}

function buildTimeTreeFromApi(entries: TimeTreeEntry[]) {
    const tree = new Map<string, Map<number, Map<number, number>>>();
    for (const e of entries) {
        if (!tree.has(e.date)) tree.set(e.date, new Map());
        const hours = tree.get(e.date)!;
        if (!hours.has(e.hour)) hours.set(e.hour, new Map());
        const minutes = hours.get(e.hour)!;
        if (!minutes.has(e.minute)) minutes.set(e.minute, e.ts);
    }
    return tree;
}

function JumpToTimePopover({ onClose, onJump }: { onClose: () => void, onJump: (ts: number) => void }) {
    const isServerSide = useServerSide.value;
    const entries = filteredEntries.value;

    const [serverTree, setServerTree] = useState<Map<string, Map<number, Map<number, number>>> | null>(null);
    useEffect(() => {
        if (!isServerSide || !currentSession.value) return;
        const filters = {
            search: searchQuery.value || undefined,
            category: categoryFilter.value.size > 0
                ? Array.from(categoryFilter.value).join(',')
                : undefined,
            signalName: signalNameFilter.value.size > 0
                ? Array.from(signalNameFilter.value).join(',')
                : undefined,
            deviceId: deviceIdFilter.value.size > 0
                ? Array.from(deviceIdFilter.value).join(',')
                : undefined,
            type: undefined as string | undefined,
        };
        getTimeTree(currentSession.value.id, filters).then(data => {
            setServerTree(buildTimeTreeFromApi(data));
        }).catch(err => console.error('Failed to fetch time tree:', err));
    }, [isServerSide]);

    const clientTree = useMemo(() => isServerSide ? new Map<string, Map<number, Map<number, number>>>() : buildTimeTree(entries), [entries, isServerSide]);
    const timeTree = isServerSide ? (serverTree ?? new Map<string, Map<number, Map<number, number>>>()) : clientTree;
    const dates = useMemo((): string[] => Array.from(timeTree.keys()).sort(), [timeTree]);

    const [selectedDate, setSelectedDate] = useState('');
    const [selectedHour, setSelectedHour] = useState('');
    const [selectedMinute, setSelectedMinute] = useState('');

    const hours = useMemo(() => {
        if (!selectedDate || !timeTree.has(selectedDate)) return [];
        return Array.from(timeTree.get(selectedDate)!.keys()).sort((a, b) => a - b);
    }, [selectedDate, timeTree]);

    const minutes = useMemo(() => {
        if (!selectedDate || !selectedHour || !timeTree.has(selectedDate)) return [];
        const hourMap = timeTree.get(selectedDate)!;
        const h = Number(selectedHour);
        if (!hourMap.has(h)) return [];
        return Array.from(hourMap.get(h)!.keys()).sort((a: number, b: number) => a - b);
    }, [selectedDate, selectedHour, timeTree]);

    const handleGo = () => {
        if (!selectedDate || selectedHour === '' || selectedMinute === '') return;
        const hourMap = timeTree.get(selectedDate);
        if (!hourMap) return;
        const minuteMap = hourMap.get(Number(selectedHour));
        if (!minuteMap) return;
        const ts = minuteMap.get(Number(selectedMinute));
        if (ts !== undefined) {
            onJump(ts);
            onClose();
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') handleGo();
        if (e.key === 'Escape') onClose();
    };

    const popoverRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && e.target instanceof HTMLElement && !popoverRef.current.contains(e.target)) {
                onClose();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div ref={popoverRef} className="jump-to-time-popover" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="popover-header">
                <span>Jump to Time</span>
            </div>
            <div className="jump-dropdowns">
                <label className="jump-field jump-field-date">
                    <span className="jump-field-label">Date</span>
                    <select
                        value={selectedDate}
                        onChange={(e) => {
                            setSelectedDate((e.target as HTMLSelectElement).value);
                            setSelectedHour('');
                            setSelectedMinute('');
                        }}
                    >
                        <option value="" disabled>—</option>
                        {dates.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className="jump-field jump-field-time">
                    <span className="jump-field-label">Hour</span>
                    <select
                        value={selectedHour}
                        disabled={!selectedDate}
                        onChange={(e) => {
                            setSelectedHour((e.target as HTMLSelectElement).value);
                            setSelectedMinute('');
                        }}
                    >
                        <option value="" disabled>—</option>
                        {hours.map(h => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}</option>)}
                    </select>
                </label>
                <label className="jump-field jump-field-time">
                    <span className="jump-field-label">Min</span>
                    <select
                        value={selectedMinute}
                        disabled={selectedHour === ''}
                        onChange={(e) => {
                            setSelectedMinute((e.target as HTMLSelectElement).value);
                        }}
                    >
                        <option value="" disabled>—</option>
                        {minutes.map(m => <option key={m} value={String(m)}>{String(m).padStart(2, '0')}</option>)}
                    </select>
                </label>
            </div>
            <button
                className="popover-go-btn jump-go-btn"
                onClick={handleGo}
                disabled={!selectedDate || selectedHour === '' || selectedMinute === ''}
            >
                Go
            </button>
            <div className="popover-tip">
                Ctrl+Shift+G to toggle
            </div>
        </div>
    );
}

/**
 * Main LogTable Component
 * 
 * Refactored with granular decomposition using hooks and sub-components.
 */
export function LogTable() {
    const tableRef = useRef<HTMLDivElement>(null);
    const scrollSignal = useSignal(0);
    const contextMenu = useSignal<{ x: number, y: number, visible: boolean, rowIndex: number | null }>({ x: 0, y: 0, visible: false, rowIndex: null });
    const categoryFilterOpenColumn = useSignal<FilterableColumn | null>(null);
    const jumpToTimeOpen = useSignal(false);
    const [isFetchingPage, setIsFetchingPage] = useState(false);
    const fetchTimeoutRef = useRef<number | null>(null);

    const isGenericLog = isGenericLogSession(currentSession.value);
    const isTRSLog = isTRSLogSession(currentSession.value);
    const isSECSLog = isSECS2LogSession(currentSession.value);
    const [selectedSECSEntry, setSelectedSECSEntry] = useState<LogEntry | null>(null);

    // ===== HOOKS =====

    // Column management
    const { state: columnState, actions: columnActions } = useColumnManagement(
        isGenericLog ? GENERIC_COLUMN_ORDER : isTRSLog ? TRS_COLUMN_ORDER : isSECSLog ? SECS_COLUMN_ORDER : DEFAULT_COLUMN_ORDER,
        isGenericLog 
            ? { ts: 220, dev: 120, sig: 100, val: 500 } 
            : isTRSLog 
                ? { ts: 180, dev: 120, cmd: 100, status: 120, src: 150, dst: 150, loc: 150, res: 100 }
                : isSECSLog
                    ? { ts: 200, dir: 100, sf: 100, sb: 130, val: 500 }
                    : { ts: 220, dev: 180, sig: 250, cat: 120, val: 150, type: 100 }
    );

    // Row selection
    const { state: selectionState, actions: selectionActions } = useRowSelection();

    // Virtual scroll
    const totalCount = useServerSide.value ? totalEntries.value : filteredEntries.value.length;
    const containerHeight = tableRef.current?.clientHeight || 600;
    const {
        state: virtualState,
        actions: virtualActions
    } = useVirtualScroll({
        rowHeight: ROW_HEIGHT,
        buffer: BUFFER,
        totalItems: totalCount,
        containerHeight,
        serverSide: useServerSide.value,
        pageSize: SERVER_PAGE_SIZE,
        maxScrollHeight: MAX_SCROLL_HEIGHT
    });

    // Search/filter with store integration
    const { state: searchState, actions: searchActions } = useSearchFilter({
        externalQuery: searchQuery.value,
        onQueryChange: (q) => searchQuery.value = q,
        onRegexChange: (v) => searchRegex.value = v,
        onCaseSensitiveChange: (v) => searchCaseSensitive.value = v,
        onShowChangedOnlyChange: (v) => showChangedOnly.value = v
    });

    // Sync search state with store
    useEffect(() => {
        searchRegex.value = searchState.useRegex;
    }, [searchState.useRegex]);

    useEffect(() => {
        searchCaseSensitive.value = searchState.caseSensitive;
    }, [searchState.caseSensitive]);

    useEffect(() => {
        showChangedOnly.value = searchState.showChangedOnly;
    }, [searchState.showChangedOnly]);

    // ===== EFFECTS =====

    // Sync selection with logStore for bookmark functionality
    useEffect(() => {
        const indices = selectionState.selectedIndices;
        if (indices.length > 0) {
            const lastIdx = indices[indices.length - 1];
            const offset = useServerSide.value ? serverPageOffset.value : 0;
            const entry = filteredEntries.value[lastIdx - offset];
            if (entry?.timestamp) {
                selectedLogTime.value = new Date(entry.timestamp).getTime();
            }
        } else {
            selectedLogTime.value = null;
        }
    }, [selectionState.selectedRows, selectionState.selectedIndices]);

    // Reset scroll when session/filters change
    useEffect(() => {
        if (tableRef.current) {
            tableRef.current.scrollTop = 0;
            virtualActions.onScroll(0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        currentSession.value?.id,
        searchQuery.value,
        categoryFilter.value,
        signalNameFilter.value,
        deviceIdFilter.value,
        sortColumn.value,
        sortDirection.value,
        virtualActions.onScroll
    ]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (fetchTimeoutRef.current) {
                window.clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, []);

    // ===== HANDLERS =====

    // Combined scroll handler
    const handleScroll = useCallback((e: Event) => {
        const scrollTop = (e.target as HTMLDivElement).scrollTop;
        scrollSignal.value = scrollTop;
        virtualActions.onScroll(scrollTop);

        if (fetchTimeoutRef.current) {
            window.clearTimeout(fetchTimeoutRef.current);
        }

        if (useServerSide.value) {
            const scale = getScrollScale();
            const realScrollTop = scrollTop * scale;
            const targetPage = Math.floor(realScrollTop / (SERVER_PAGE_SIZE * ROW_HEIGHT)) + 1;
            const currentLoadedPage = Math.floor(serverPageOffset.value / SERVER_PAGE_SIZE) + 1;

            if (targetPage !== currentLoadedPage) {
                fetchTimeoutRef.current = window.setTimeout(() => {
                    const fetchPage = Math.max(1, targetPage);
                    setIsFetchingPage(true);
                    fetchEntries(fetchPage, SERVER_PAGE_SIZE).finally(() => {
                        setIsFetchingPage(false);
                    });
                }, 100);
            }
        }

        if (contextMenu.value.visible) {
            contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
        }
    }, [virtualActions, contextMenu, scrollSignal]);

    // Row mouse handlers
    const handleRowMouseDown = useCallback((idx: number, e: MouseEvent) => {
        if (e.button === 2) return;
        contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
        selectionActions.handleRowClick(e, idx);
    }, [selectionActions, contextMenu]);

    const handleRowContextMenu = useCallback((idx: number, e: MouseEvent) => {
        e.preventDefault();
        if (!selectionState.selectedRows.has(idx)) {
            selectionActions.selectRow(idx);
        }
        contextMenu.value = { x: e.clientX, y: e.clientY, visible: true, rowIndex: idx };
    }, [contextMenu, selectionActions, selectionState.selectedRows]);

    // Keyboard shortcuts
    const selectedIndex = selectionState.selectedIndices.length > 0
        ? selectionState.selectedIndices[selectionState.selectedIndices.length - 1]
        : null;

    const keyboardActions = useKeyboardShortcuts({
        totalCount,
        selectedIndex,
        pageSize: 20,
        serverSide: useServerSide.value,
        serverPageOffset: serverPageOffset.value,
        serverPageLength: filteredEntries.value.length,
        serverPageSize: SERVER_PAGE_SIZE,
        rowHeight: ROW_HEIGHT,
        scrollScale: virtualState.scaleFactor,
        containerRef: tableRef,
        onSelect: (index, options) => {
            if (options?.range) {
                selectionActions.selectRange(index);
            } else {
                selectionActions.selectRow(index);
            }
        },
        onSelectAll: () => {
            if (useServerSide.value) {
                const offset = serverPageOffset.value;
                const pageLen = filteredEntries.value.length;
                for (let i = offset; i < offset + pageLen; i++) {
                    selectionActions.toggleRow(i);
                }
            } else {
                selectionActions.selectAll(totalCount);
            }
        },
        onCopy: () => {
            const entries = filteredEntries.value;
            const offset = useServerSide.value ? serverPageOffset.value : 0;
            const text = selectionState.selectedIndices
                .map(idx => {
                    const e = entries[idx - offset];
                    return e ? `${formatDateTime(e.timestamp)}\t${e.deviceId}\t${e.signalName}\t${e.value}` : '';
                })
                .filter(line => line !== '')
                .join('\n');
            navigator.clipboard.writeText(text);
            contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
        },
        onJumpToIndex: (page) => fetchEntries(page, SERVER_PAGE_SIZE),
        onJumpToTime: () => jumpToTimeOpen.value = !jumpToTimeOpen.value
    });

    // Header click handler
    const handleHeaderClick = useCallback((col: SortColumnKey) => {
        if (sortColumn.value === col) {
            sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn.value = col;
            sortDirection.value = 'asc';
        }
    }, []);

    // Action handlers
    const handleCopy = useCallback(() => {
        const entries = filteredEntries.value;
        const offset = useServerSide.value ? serverPageOffset.value : 0;
        const text = selectionState.selectedIndices
            .map(idx => {
                const e = entries[idx - offset];
                return e ? `${formatDateTime(e.timestamp)}\t${e.deviceId}\t${e.signalName}\t${e.value}` : '';
            })
            .filter(line => line !== '')
            .join('\n');
        navigator.clipboard.writeText(text);
        contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
    }, [selectionState.selectedIndices, contextMenu]);

    const handleAddToWaveform = useCallback(() => {
        const entries = filteredEntries.value;
        const offset = useServerSide.value ? serverPageOffset.value : 0;
        const processed = new Set<string>();

        selectionState.selectedIndices.forEach(idx => {
            const e = entries[idx - offset];
            if (e) {
                const key = `${e.deviceId}::${e.signalName}`;
                if (!processed.has(key)) {
                    toggleSignal(e.deviceId, e.signalName);
                    processed.add(key);
                }
            }
        });
        contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
    }, [contextMenu, selectionState.selectedIndices]);

    const getEntryForRowIndex = useCallback((idx: number | null) => {
        if (idx === null) return null;
        const entries = filteredEntries.value;
        const offset = useServerSide.value ? serverPageOffset.value : 0;
        return entries[idx - offset] || null;
    }, []);

    const handleOpenWaveformAtTime = useCallback(() => {
        const entry = getEntryForRowIndex(contextMenu.value.rowIndex);
        if (!entry) {
            contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
            return;
        }
        selectedLogTime.value = new Date(entry.timestamp).getTime();
        openView('waveform');
        contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
    }, [contextMenu, getEntryForRowIndex]);

    const handleOpenMapAtTime = useCallback(() => {
        const entry = getEntryForRowIndex(contextMenu.value.rowIndex);
        if (!entry) {
            contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
            return;
        }
        const ts = new Date(entry.timestamp).getTime();
        selectedLogTime.value = ts;
        setPlaybackTime(ts);
        openView('map-viewer');
        contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
    }, [contextMenu, getEntryForRowIndex]);

    const handleReload = useCallback(() => {
        if (useServerSide.value) {
            const currentPage = Math.floor(serverPageOffset.value / SERVER_PAGE_SIZE) + 1;
            fetchEntries(currentPage, SERVER_PAGE_SIZE);
        } else {
            fetchEntries(1, 1000);
        }
    }, []);

    // Jump to time handler
    const handleJumpToTime = useCallback(async (ts: number) => {
        const index = await jumpToTime(ts);
        if (index !== null && tableRef.current) {
            tableRef.current.scrollTop = (index * ROW_HEIGHT) / getScrollScale();
            selectionActions.selectRow(index);
        }
    }, [selectionActions]);

    // ===== RENDER CALCULATIONS =====

    const startIdx = useServerSide.value
        ? serverPageOffset.value
        : virtualState.startIndex;

    const visibleEntries = useServerSide.value
        ? filteredEntries.value
        : filteredEntries.value.slice(virtualState.startIndex, virtualState.endIndex);

    // ===== RENDER =====

    return (
        <div
            className="log-table-container"
            onKeyDown={keyboardActions.handleKeyDown}
            onClick={() => contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null }}
            tabIndex={0}
        >
            {/* Toolbar */}
            <LogTableToolbar
                searchState={searchState}
                onSearchChange={searchActions.setQuery}
                highlightQuery={highlightQuery.value}
                onHighlightQueryChange={(q) => highlightQuery.value = q}
                onToggleRegex={searchActions.toggleRegex}
                onToggleCaseSensitive={searchActions.toggleCaseSensitive}
                onToggleShowChangedOnly={searchActions.toggleShowChangedOnly}
                selectionCount={selectionState.selectionCount}
                jumpToTimeOpen={jumpToTimeOpen.value}
                onToggleJumpToTime={() => jumpToTimeOpen.value = !jumpToTimeOpen.value}
                onOpenWaveform={isGenericLog || isTRSLog || isSECSLog ? undefined : () => openView('waveform')}
                onCopy={handleCopy}
                onReload={handleReload}
            />

            {/* Table */}
            <div className="log-table-view-split">
                <SignalSidebar />
                <div className="log-table-content">
                    {/* Header */}
                    <div className="log-table-header">
                        {columnState.columnOrder.map((colKey) => {
                            const columns = isGenericLog ? GENERIC_COLUMNS : isTRSLog ? TRS_COLUMNS : isSECSLog ? SECS_COLUMNS : DEFAULT_COLUMNS;
                            const colDef = columns.find(c => c.key === colKey)!;
                            const isDragOver = columnActions.isDragOver(colKey);
                            const isDraggingCol = columnActions.isDragging(colKey);
                            const width = columnActions.getColumnWidth(colDef.id);
                            const filterColumn: FilterableColumn | null = (colDef.key === 'category' || colDef.key === 'signalName' || colDef.key === 'deviceId')
                                ? colDef.key
                                : null;
                            const canShowColumnFilterToggle = filterColumn !== null;
                            const isFilterOpen = filterColumn !== null && categoryFilterOpenColumn.value === filterColumn;
                            const activeFilterCount = filterColumn === 'category'
                                ? categoryFilter.value.size
                                : filterColumn === 'signalName'
                                    ? signalNameFilter.value.size
                                    : filterColumn === 'deviceId'
                                        ? deviceIdFilter.value.size
                                        : 0;
                            const hasActiveColumnFilter = activeFilterCount > 0;

                            return (
                                <div
                                    key={colDef.key}
                                    className={`log-col col-${colDef.id} ${canShowColumnFilterToggle ? 'col-filterable' : ''} ${hasActiveColumnFilter && canShowColumnFilterToggle ? 'filter-active' : ''} ${isDragOver ? 'drag-over' : ''} ${isDraggingCol ? 'dragging' : ''}`}
                                    style={{ width }}
                                    onClick={() => colDef.sortable && handleHeaderClick(colDef.key as SortColumnKey)}
                                    draggable
                                    onDragStart={(e) => columnActions.handleDragStart(colDef.key, e)}
                                    onDragEnd={columnActions.handleDragEnd}
                                    onDragOver={(e) => columnActions.handleDragOver(colDef.key, e)}
                                    onDragLeave={columnActions.handleDragLeave}
                                    onDrop={(e) => columnActions.handleDrop(colDef.key, e)}
                                    title="Drag to reorder"
                                >
                                    <span className="col-header-text">
                                        {colDef.label}
                                    </span>
                                    {colDef.sortable && sortColumn.value === colDef.key && (
                                        sortDirection.value === 'asc' ? <span>▲</span> : <span>▼</span>
                                    )}
                                    {canShowColumnFilterToggle && (
                                        <button
                                            className={`category-filter-btn ${hasActiveColumnFilter ? 'active' : ''}`}
                                            onMouseDown={(e) => {
                                                // Prevent header drag/sort from consuming the filter button click.
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                categoryFilterOpenColumn.value = isFilterOpen ? null : filterColumn;
                                            }}
                                            title={filterColumn === 'category' ? 'Filter by category' : filterColumn === 'signalName' ? 'Filter by signal name' : 'Filter by device ID'}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                            </svg>
                                            {hasActiveColumnFilter && (
                                                <span className="filter-badge">{activeFilterCount}</span>
                                            )}
                                        </button>
                                    )}
                                    {isFilterOpen && filterColumn && (
                                        <ColumnFilterPopoverContainer
                                            column={filterColumn}
                                            onClose={() => categoryFilterOpenColumn.value = null}
                                        />
                                    )}
                                    {colDef.resizable && (
                                        <div className="resize-handle" onMouseDown={(e) => columnActions.handleResize(colDef.id, e)} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Viewport with rows */}
                    <LogTableViewport
                        ref={tableRef}
                        containerRef={tableRef}
                        virtualState={virtualState}
                        visibleEntries={visibleEntries}
                        startIndex={startIdx}
                        selectedRows={selectionState.selectedRows}
                        columnOrder={columnState.columnOrder}
                        columnWidths={columnState.columnWidths}
                        serverSide={useServerSide.value}
                        serverPageOffset={serverPageOffset.value}
                        filterQuery={searchQuery.value}
                        highlightQuery={highlightQuery.value}
                        searchRegex={searchRegex.value}
                        searchCaseSensitive={searchCaseSensitive.value}
                        rowHeight={ROW_HEIGHT}
                        scrollScale={virtualState.scaleFactor}
                        isLoading={isLoadingLog.value}
                        isStreaming={isStreaming.value}
                        streamProgress={streamProgress.value}
                        isFetchingPage={isFetchingPage && !isLoadingLog.value}
                        totalCount={totalCount}
                        colorSettings={colorSettings.value}
                        onRowMouseDown={handleRowMouseDown}
                        onRowContextMenu={handleRowContextMenu}
                        onSECSClick={(entry) => setSelectedSECSEntry(entry)}
                        onScroll={handleScroll}
                    />

                    {/* Jump to Time popover */}
                    {jumpToTimeOpen.value && (
                        <JumpToTimePopover
                            onClose={() => jumpToTimeOpen.value = false}
                            onJump={handleJumpToTime}
                        />
                    )}

                    {/* Context menu */}
                    {contextMenu.value.visible && (
                        <div className="context-menu" style={{ top: contextMenu.value.y, left: contextMenu.value.x }}>
                            {!isGenericLog && !isSECSLog && <div className="menu-item" onClick={handleAddToWaveform}>Add to Waveform</div>}
                            {!isGenericLog && !isSECSLog && <div className="menu-item" onClick={handleOpenWaveformAtTime}>Open Waveform at This Time</div>}
                            {isSECSLog && (
                                <div className="menu-item" onClick={() => {
                                    const entry = getEntryForRowIndex(contextMenu.value.rowIndex);
                                    if (entry) setSelectedSECSEntry(entry);
                                    contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null };
                                }}>View SECS Message</div>
                            )}
                            <div className="menu-item" onClick={handleOpenMapAtTime}>Open Map at This Time</div>
                            <div className="menu-item" onClick={handleCopy}>Copy Selected Rows</div>
                            <div className="menu-item" onClick={() => { selectionActions.clearSelection(); contextMenu.value = { ...contextMenu.value, visible: false, rowIndex: null }; }}>Clear Selection</div>
                        </div>
                    )}
                </div>
            </div>
            {/* SECS Message Dialog */}
            {isSECSLog && (
                <SECSMessageDialog
                    isOpen={selectedSECSEntry !== null}
                    onClose={() => setSelectedSECSEntry(null)}
                    entry={selectedSECSEntry}
                />
            )}
        </div>
    );
}
