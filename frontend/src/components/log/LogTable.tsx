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
    searchHighlightMode,
    totalEntries,
    fetchEntries,
    useServerSide,
    serverPageOffset,
    openView,
    selectedLogTime,
    isStreaming,
    streamProgress,
    categoryFilter,
    availableCategories,
    jumpToTime,
} from '../../stores/logStore';
import { getTimeTree } from '../../api/client';
import type { TimeTreeEntry } from '../../api/client';
import { toggleSignal } from '../../stores/waveformStore';
import { formatDateTime } from '../../utils/TimeAxisUtils';
import type { LogEntry } from '../../models/types';
import { colorSettings } from '../../stores/colorCodingStore';
import { SignalSidebar } from '../waveform/SignalSidebar';

// Components
import { LogTableToolbar } from './components/LogTableToolbar';
import { HighlightText } from './components/HighlightText';

// Hooks
import {
    useVirtualScroll,
    useRowSelection,
    useColumnManagement,
    useSearchFilter,
    useKeyboardShortcuts,
    DEFAULT_COLUMNS,
    DEFAULT_COLUMN_ORDER
} from './hooks';

// Utils
import { computeRowColorCoding } from './utils/colorCoding';

import './LogTable.css';

const ROW_HEIGHT = 28;
const BUFFER = 15;
const SERVER_PAGE_SIZE = 200;
const MAX_SCROLL_HEIGHT = 15_000_000;

/** Compute scroll scale factor when virtual height exceeds browser max */
function getScrollScale(): number {
    if (!useServerSide.value) return 1;
    const realTotal = totalEntries.value * ROW_HEIGHT;
    if (realTotal <= MAX_SCROLL_HEIGHT) return 1;
    return realTotal / MAX_SCROLL_HEIGHT;
}

/**
 * Category Filter Popover Component (uses logStore)
 */
function CategoryFilterPopoverContainer({ onClose }: { onClose: () => void }) {
    const categories = availableCategories.value;
    const [localSearchQuery, setLocalSearchQuery] = useState('');

    const filteredCategories = localSearchQuery.trim() === ''
        ? categories
        : categories.filter(cat =>
            (cat || '(Uncategorized)').toLowerCase().includes(localSearchQuery.toLowerCase())
        );

    const handleToggle = (cat: string) => {
        const normalizedCat = cat ?? '';
        const currentFilter = categoryFilter.value;
        const newFilter = new Set(currentFilter);
        if (newFilter.has(normalizedCat)) {
            newFilter.delete(normalizedCat);
        } else {
            newFilter.add(normalizedCat);
        }
        categoryFilter.value = newFilter;
    };

    const handleClearAll = () => {
        categoryFilter.value = new Set();
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
                <span>Filter by Category</span>
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
                    placeholder="Search categories..."
                    value={localSearchQuery}
                    onInput={(e) => setLocalSearchQuery((e.target as HTMLInputElement).value)}
                />
            </div>
            <div className="popover-list">
                {categories.length === 0 ? (
                    <div className="popover-empty">No categories available</div>
                ) : filteredCategories.length === 0 ? (
                    <div className="popover-empty">No matching categories</div>
                ) : (
                    filteredCategories.map(cat => {
                        const normalizedCat = cat ?? '';
                        return (
                            <label key={normalizedCat || '__uncategorized__'} className="filter-item">
                                <input
                                    type="checkbox"
                                    checked={categoryFilter.value.has(normalizedCat)}
                                    onChange={() => handleToggle(normalizedCat)}
                                />
                                <span className="filter-label">{normalizedCat || '(Uncategorized)'}</span>
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
        <div ref={popoverRef} className="jump-to-time-popover" onKeyDown={handleKeyDown}>
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
    const contextMenu = useSignal<{ x: number, y: number, visible: boolean }>({ x: 0, y: 0, visible: false });
    const categoryFilterOpen = useSignal(false);
    const jumpToTimeOpen = useSignal(false);
    const [isFetchingPage, setIsFetchingPage] = useState(false);
    const fetchTimeoutRef = useRef<number | null>(null);

    // ===== HOOKS =====

    // Column management
    const { state: columnState, actions: columnActions } = useColumnManagement(
        DEFAULT_COLUMN_ORDER,
        { ts: 220, dev: 180, sig: 250, cat: 120, val: 150, type: 100 }
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
        onShowChangedOnlyChange: (v) => showChangedOnly.value = v,
        onHighlightModeChange: (v) => searchHighlightMode.value = v
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

    useEffect(() => {
        searchHighlightMode.value = searchState.highlightMode;
    }, [searchState.highlightMode]);

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
    }, [currentSession.value?.id, searchQuery.value, categoryFilter.value, sortColumn.value, sortDirection.value, virtualActions.onScroll]);

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
            contextMenu.value = { ...contextMenu.value, visible: false };
        }
    }, [virtualActions, contextMenu, scrollSignal]);

    // Row mouse handlers
    const handleRowMouseDown = useCallback((idx: number, e: MouseEvent) => {
        if (e.button === 2) return;
        contextMenu.value = { ...contextMenu.value, visible: false };
        selectionActions.handleRowClick(e, idx);
    }, [selectionActions, contextMenu]);

    const handleRowContextMenu = useCallback((e: MouseEvent) => {
        e.preventDefault();
        contextMenu.value = { x: e.clientX, y: e.clientY, visible: true };
    }, [contextMenu]);

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
            contextMenu.value = { ...contextMenu.value, visible: false };
        },
        onJumpToIndex: (page) => fetchEntries(page, SERVER_PAGE_SIZE),
        onJumpToTime: () => jumpToTimeOpen.value = !jumpToTimeOpen.value
    });

    // Header click handler
    const handleHeaderClick = useCallback((col: keyof LogEntry) => {
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
        contextMenu.value = { ...contextMenu.value, visible: false };
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
        contextMenu.value = { ...contextMenu.value, visible: false };
    }, [selectionState.selectedIndices]);

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
            onClick={() => contextMenu.value = { ...contextMenu.value, visible: false }}
            tabIndex={0}
        >
            {/* Toolbar */}
            <LogTableToolbar
                searchState={searchState}
                onSearchChange={searchActions.setQuery}
                onToggleRegex={searchActions.toggleRegex}
                onToggleCaseSensitive={searchActions.toggleCaseSensitive}
                onToggleShowChangedOnly={searchActions.toggleShowChangedOnly}
                onToggleHighlightMode={searchActions.toggleHighlightMode}
                selectionCount={selectionState.selectionCount}
                jumpToTimeOpen={jumpToTimeOpen.value}
                onToggleJumpToTime={() => jumpToTimeOpen.value = !jumpToTimeOpen.value}
                onOpenWaveform={() => openView('waveform')}
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
                            const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                            const isDragOver = columnActions.isDragOver(colKey);
                            const isDraggingCol = columnActions.isDragging(colKey);
                            const width = columnActions.getColumnWidth(colDef.id);

                            if (colDef.key === 'category') {
                                return (
                                    <div
                                        key={colDef.key}
                                        className={`log-col col-cat ${categoryFilter.value.size > 0 ? 'filter-active' : ''} ${isDragOver ? 'drag-over' : ''} ${isDraggingCol ? 'dragging' : ''}`}
                                        style={{ width }}
                                        draggable
                                        onDragStart={(e) => columnActions.handleDragStart(colDef.key, e)}
                                        onDragEnd={columnActions.handleDragEnd}
                                        onDragOver={(e) => columnActions.handleDragOver(colDef.key, e)}
                                        onDragLeave={columnActions.handleDragLeave}
                                        onDrop={(e) => columnActions.handleDrop(colDef.key, e)}
                                        title="Drag to reorder"
                                    >
                                        <span className="col-header-text" onClick={() => handleHeaderClick('category')}>
                                            {colDef.label}
                                            {sortColumn.value === 'category' && (
                                                sortDirection.value === 'asc' ? <span>▲</span> : <span>▼</span>
                                            )}
                                        </span>
                                        <button
                                            className={`category-filter-btn ${categoryFilter.value.size > 0 ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                categoryFilterOpen.value = !categoryFilterOpen.value;
                                            }}
                                            title="Filter by category"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                            </svg>
                                            {categoryFilter.value.size > 0 && (
                                                <span className="filter-badge">{categoryFilter.value.size}</span>
                                            )}
                                        </button>
                                        {categoryFilterOpen.value && (
                                            <CategoryFilterPopoverContainer onClose={() => categoryFilterOpen.value = false} />
                                        )}
                                        {colDef.resizable && (
                                            <div className="resize-handle" onMouseDown={(e) => columnActions.handleResize(colDef.id, e)} />
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={colDef.key}
                                    className={`log-col col-${colDef.id} ${isDragOver ? 'drag-over' : ''} ${isDraggingCol ? 'dragging' : ''}`}
                                    style={{ width }}
                                    onClick={() => colDef.sortable && handleHeaderClick(colDef.key as keyof LogEntry)}
                                    draggable
                                    onDragStart={(e) => columnActions.handleDragStart(colDef.key, e)}
                                    onDragEnd={columnActions.handleDragEnd}
                                    onDragOver={(e) => columnActions.handleDragOver(colDef.key, e)}
                                    onDragLeave={columnActions.handleDragLeave}
                                    onDrop={(e) => columnActions.handleDrop(colDef.key, e)}
                                    title="Drag to reorder"
                                >
                                    {colDef.label}
                                    {colDef.sortable && sortColumn.value === colDef.key && (
                                        sortDirection.value === 'asc' ? <span>▲</span> : <span>▼</span>
                                    )}
                                    {colDef.resizable && (
                                        <div className="resize-handle" onMouseDown={(e) => columnActions.handleResize(colDef.id, e)} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Viewport with rows */}
                    <div className="log-table-viewport" ref={tableRef} onScroll={handleScroll}>
                        <div
                            className="log-table-spacer"
                            style={{ height: `${virtualState.scrollHeight}px` }}
                        >
                            <div
                                className="log-table-rows"
                                style={{ transform: `translateY(${useServerSide.value ? (serverPageOffset.value * ROW_HEIGHT) / virtualState.scaleFactor : virtualState.offsetY}px)` }}
                            >
                                {visibleEntries.map((entry, i) => {
                                    const actualIdx = startIdx + i;
                                    const isSelected = selectionActions.isSelected(actualIdx);

                                    // Compute color coding
                                    const colorResult = colorSettings.value.enabled
                                        ? computeRowColorCoding(entry, colorSettings.value)
                                        : { classes: [], styles: {}, valueClassMods: [] };

                                    // Check highlight match
                                    const isHighlightMatch = searchHighlightMode.value && searchQuery.value && (
                                        entry.deviceId.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                                        entry.signalName.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                                        String(entry.value).toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                                        (entry.category || '').toLowerCase().includes(searchQuery.value.toLowerCase())
                                    );

                                    const classNames = ['log-table-row'];
                                    if (isSelected) classNames.push('selected');
                                    if (isHighlightMatch) classNames.push('search-highlight');
                                    classNames.push(...colorResult.classes);

                                    return (
                                        <div
                                            key={actualIdx}
                                            className={classNames.join(' ')}
                                            style={colorResult.styles}
                                            onMouseDown={(e) => handleRowMouseDown(actualIdx, e)}
                                            onContextMenu={handleRowContextMenu}
                                        >
                                            {columnState.columnOrder.map((colKey) => {
                                                const colId = { timestamp: 'ts', deviceId: 'dev', signalName: 'sig', category: 'cat', value: 'val', type: 'type' }[colKey];
                                                const width = columnActions.getColumnWidth(colId!);

                                                switch (colKey) {
                                                    case 'timestamp':
                                                        return <div key={colKey} className="log-col" style={{ width }}>{formatDateTime(entry.timestamp)}</div>;
                                                    case 'deviceId':
                                                        return <div key={colKey} className="log-col" style={{ width }}><HighlightText text={entry.deviceId} query={searchQuery.value} useRegex={searchRegex.value} caseSensitive={searchCaseSensitive.value} /></div>;
                                                    case 'signalName':
                                                        return <div key={colKey} className="log-col" style={{ width }}><HighlightText text={entry.signalName} query={searchQuery.value} useRegex={searchRegex.value} caseSensitive={searchCaseSensitive.value} /></div>;
                                                    case 'category':
                                                        return <div key={colKey} className="log-col" style={{ width }}><HighlightText text={entry.category || ''} query={searchQuery.value} useRegex={searchRegex.value} caseSensitive={searchCaseSensitive.value} /></div>;
                                                    case 'value': {
                                                        const valueStr = String(entry.value);
                                                        const dataAttr = entry.signalType === 'boolean' ? { 'data-value': valueStr.toLowerCase() } : {};
                                                        const valueClass = `log-col val-${entry.signalType} ${colorResult.valueClassMods.join(' ')}`;
                                                        return <div key={colKey} className={valueClass} style={{ width }} {...dataAttr}><HighlightText text={valueStr} query={searchQuery.value} useRegex={searchRegex.value} caseSensitive={searchCaseSensitive.value} /></div>;
                                                    }
                                                    case 'type':
                                                        return <div key={colKey} className="log-col" style={{ width }}>{entry.signalType}</div>;
                                                    default:
                                                        return null;
                                                }
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Loading states */}
                        {(isLoadingLog.value || isStreaming.value) && (
                            <div className="log-loading-overlay">
                                <div className="loader"></div>
                                {isStreaming.value ? (
                                    <div className="streaming-progress">
                                        <span>Streaming Log Entries... {streamProgress.value}%</span>
                                        <div className="progress-bar-container">
                                            <div className="progress-bar" style={{ width: `${streamProgress.value}%` }}></div>
                                        </div>
                                    </div>
                                ) : (
                                    <span>Loading Log Data...</span>
                                )}
                            </div>
                        )}

                        {useServerSide.value && isFetchingPage && !isLoadingLog.value && (
                            <div className="log-loading-indicator">
                                <div className="loader-small"></div>
                                <span>Loading more entries...</span>
                            </div>
                        )}

                        {!isLoadingLog.value && totalCount === 0 && (
                            <div className="log-empty-state">
                                {searchQuery.value ? 'No entries match your filter' : 'No entries found'}
                            </div>
                        )}
                    </div>

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
                            <div className="menu-item" onClick={handleAddToWaveform}>Add to Waveform</div>
                            <div className="menu-item" onClick={handleCopy}>Copy Selected Rows</div>
                            <div className="menu-item" onClick={() => { selectionActions.clearSelection(); contextMenu.value = { ...contextMenu.value, visible: false }; }}>Clear Selection</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
