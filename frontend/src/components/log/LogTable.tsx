
import { useSignal } from '@preact/signals';
import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
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
    totalEntries,
    fetchEntries,
    useServerSide,
    openView,
    selectedLogTime,
    isStreaming,
    streamProgress,
    categoryFilter,
    availableCategories,
    jumpToTime
} from '../../stores/logStore';
import { toggleSignal } from '../../stores/waveformStore';
import { formatDateTime } from '../../utils/TimeAxisUtils';
import type { LogEntry } from '../../models/types';
import { SignalSidebar } from '../waveform/SignalSidebar';
import { SearchIcon, ChartIcon, CopyIcon, RefreshIcon, ChevronUpIcon, ChevronDownIcon, FilterIcon, ClockIcon } from '../icons';
import './LogTable.css';

const ROW_HEIGHT = 28;
const BUFFER = 15; // Increased buffer for smoother scrolling
const SERVER_PAGE_SIZE = 200; // Larger pages = fewer requests

/**
 * Category Filter Popover Component
 */
function CategoryFilterPopover({ onClose }: { onClose: () => void }) {
    // Access signals reactively - re-renders when they change
    const categories = availableCategories.value;
    const [searchQuery, setSearchQuery] = useState('');

    // Filter categories based on search query
    const filteredCategories = searchQuery.trim() === ''
        ? categories
        : categories.filter(cat =>
            (cat || '(Uncategorized)').toLowerCase().includes(searchQuery.toLowerCase())
        );

    const handleToggle = (cat: string) => {
        // Normalize null/undefined to empty string for consistent filtering
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

    // Close on outside click
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
        // Delay to avoid immediate close from the click that opened it
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
                <span className="popover-search-icon"><SearchIcon size={12} /></span>
                <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                />
            </div>
            <div className="popover-list">
                {categories.length === 0 ? (
                    <div className="popover-empty">No categories available</div>
                ) : filteredCategories.length === 0 ? (
                    <div className="popover-empty">No matching categories</div>
                ) : (
                    filteredCategories.map(cat => {
                        // Normalize null/undefined to empty string for consistent filtering
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
 * Jump to Time Popover Component
 */
function JumpToTimePopover({ onClose, onJump }: { onClose: () => void, onJump: (ts: number) => void }) {
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedHour, setSelectedHour] = useState('');
    const [selectedMinute, setSelectedMinute] = useState('');

    const isValid = selectedDate !== '' && selectedHour !== '' && selectedMinute !== ''
        && Number(selectedHour) >= 0 && Number(selectedHour) <= 23
        && Number(selectedMinute) >= 0 && Number(selectedMinute) <= 59;

    const handleGo = () => {
        if (!isValid) return;
        const [year, month, day] = selectedDate.split('-').map(Number);
        const ts = Date.UTC(year, month - 1, day, Number(selectedHour), Number(selectedMinute), 0, 0);
        onJump(ts);
        onClose();
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
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate((e.target as HTMLInputElement).value)}
                    />
                </label>
                <label className="jump-field jump-field-time">
                    <span className="jump-field-label">Hour</span>
                    <input
                        type="number"
                        min={0}
                        max={23}
                        placeholder="HH"
                        value={selectedHour}
                        onChange={(e) => setSelectedHour((e.target as HTMLInputElement).value)}
                    />
                </label>
                <label className="jump-field jump-field-time">
                    <span className="jump-field-label">Min</span>
                    <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="MM"
                        value={selectedMinute}
                        onChange={(e) => setSelectedMinute((e.target as HTMLInputElement).value)}
                    />
                </label>
            </div>
            <button
                className="popover-go-btn jump-go-btn"
                onClick={handleGo}
                disabled={!isValid}
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
 * Performant Log Table with Virtual Scrolling and Premium UX
 */
// Column definition type
type ColumnKey = 'timestamp' | 'deviceId' | 'signalName' | 'category' | 'value' | 'type';

interface ColumnDef {
    key: ColumnKey;
    id: string; // Short ID for width lookup
    label: string;
    sortable: boolean;
    resizable: boolean;
}

const COLUMNS: ColumnDef[] = [
    { key: 'timestamp', id: 'ts', label: 'TIMESTAMP', sortable: true, resizable: true },
    { key: 'deviceId', id: 'dev', label: 'DEVICE ID', sortable: true, resizable: true },
    { key: 'signalName', id: 'sig', label: 'SIGNAL NAME', sortable: true, resizable: true },
    { key: 'category', id: 'cat', label: 'CATEGORY', sortable: true, resizable: true },
    { key: 'value', id: 'val', label: 'VALUE', sortable: false, resizable: true },
    { key: 'type', id: 'type', label: 'TYPE', sortable: false, resizable: false },
];

export function LogTable() {
    const tableRef = useRef<HTMLDivElement>(null);
    const scrollSignal = useSignal(0);
    const selectedRows = useSignal<Set<number>>(new Set());
    // For drag selection
    const isDragging = useSignal(false);
    const dragStartIndex = useSignal<number | null>(null);

    const columnWidths = useSignal({
        ts: 220,
        dev: 180,
        sig: 250,
        cat: 120,
        val: 150,
        type: 100
    });
    const contextMenu = useSignal<{ x: number, y: number, visible: boolean }>({ x: 0, y: 0, visible: false });

    // --- Column Order (Draggable) ---
    const columnOrder = useSignal<ColumnKey[]>(['timestamp', 'deviceId', 'signalName', 'category', 'value', 'type']);
    const draggedColumn = useSignal<ColumnKey | null>(null);
    const dragOverColumn = useSignal<ColumnKey | null>(null);

    // --- Category Filter Popover ---
    const categoryFilterOpen = useSignal(false);
    const jumpToTimeOpen = useSignal(false);

    // --- Debounced Search ---
    const [localQuery, setLocalQuery] = useState(searchQuery.value);
    useEffect(() => {
        const handler = setTimeout(() => {
            searchQuery.value = localQuery;
        }, 100);
        return () => clearTimeout(handler);
    }, [localQuery]);

    // Keep local query in sync if external change happens
    useEffect(() => {
        if (searchQuery.value !== localQuery) {
            setLocalQuery(searchQuery.value);
        }
    }, [searchQuery.value]);

    // Update selectedLogTime for bookmark functionality
    useEffect(() => {
        const indices = Array.from(selectedRows.value);
        if (indices.length > 0) {
            // Use the last selected row's timestamp
            const lastIdx = indices[indices.length - 1];
            const entry = filteredEntries.value[lastIdx];
            if (entry?.timestamp) {
                selectedLogTime.value = new Date(entry.timestamp).getTime();
            }
        } else {
            selectedLogTime.value = null;
        }
    }, [selectedRows.value]);

    // Use a ref for scroll position to avoid signal update overhead during scroll
    const scrollTopRef = useRef(0);
    const scrollTimeoutRef = useRef<number | null>(null);
    const isScrollingRef = useRef(false);

    // Track loaded page range for server-side mode
    const loadedRangeRef = useRef({ start: 1, end: 1 });
    const pendingFetchRef = useRef<Promise<void> | null>(null);
    const [isFetchingPage, setIsFetchingPage] = useState(false);

    // Force re-render when entries change (for server-side virtual scrolling)
    // Debounced to prevent excessive re-renders during rapid scrolling
    const [, forceRender] = useState({});
    useEffect(() => {
        const timer = setTimeout(() => {
            forceRender({});
        }, 50); // 50ms debounce
        return () => clearTimeout(timer);
    }, [filteredEntries.value, totalEntries.value]);

    // Reset scroll and page when session or filters change
    useEffect(() => {
        if (tableRef.current) {
            tableRef.current.scrollTop = 0;
            scrollTopRef.current = 0;
            scrollSignal.value = 0;
        }
        loadedRangeRef.current = { start: 1, end: 1 };
    }, [currentSession.value?.id, searchQuery.value, categoryFilter.value, sortColumn.value, sortDirection.value]);

    // Separate ref for fetch debouncing
    const fetchTimeoutRef = useRef<number | null>(null);
    const scrollDebounceRef = useRef<number | null>(null);

    // Optimized scroll handler with debouncing
    const onScroll = useCallback((e: Event) => {
        const scrollTop = (e.target as HTMLDivElement).scrollTop;
        scrollTopRef.current = scrollTop;

        // Clear existing timeouts
        if (scrollDebounceRef.current) {
            window.clearTimeout(scrollDebounceRef.current);
        }
        if (fetchTimeoutRef.current) {
            window.clearTimeout(fetchTimeoutRef.current);
        }

        // Mark as actively scrolling
        isScrollingRef.current = true;

        // Update scroll signal immediately for rigid scrolling
        scrollSignal.value = scrollTop;

        // Server-side: Debounced page fetching
        if (useServerSide.value) {
            const targetPage = Math.floor(scrollTop / (SERVER_PAGE_SIZE * ROW_HEIGHT)) + 1;
            const bufferPages = 2; // Preload 2 pages ahead

            // Check if we need to fetch (with buffer for prefetching)
            if (targetPage + bufferPages > loadedRangeRef.current.end ||
                targetPage < loadedRangeRef.current.start) {

                fetchTimeoutRef.current = window.setTimeout(() => {
                    const fetchPage = Math.max(1, targetPage);

                    // Avoid duplicate fetches
                    if (!pendingFetchRef.current) {
                        setIsFetchingPage(true);
                        pendingFetchRef.current = fetchEntries(fetchPage, SERVER_PAGE_SIZE).finally(() => {
                            pendingFetchRef.current = null;
                            setIsFetchingPage(false);
                        });
                        loadedRangeRef.current = { start: fetchPage, end: fetchPage + 2 };
                    }
                }, 150); // Slightly longer debounce for smoother scrolling
            }
        }

        if (contextMenu.value.visible) contextMenu.value = { ...contextMenu.value, visible: false };
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                window.clearTimeout(scrollTimeoutRef.current);
            }
            if (fetchTimeoutRef.current) {
                window.clearTimeout(fetchTimeoutRef.current);
            }
            if (scrollDebounceRef.current) {
                window.clearTimeout(scrollDebounceRef.current);
            }
        };
    }, []);

    // --- Keyboard Navigation ---
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ctrl+Shift+G / Cmd+Shift+G: Toggle Jump to Time popover (works even with no selection)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
            e.preventDefault();
            jumpToTimeOpen.value = !jumpToTimeOpen.value;
            return;
        }

        if (selectedRows.value.size === 0) return;

        // Get the last selected index (anchor)
        const indices = Array.from(selectedRows.value).sort((a, b) => a - b);
        let curr = indices[indices.length - 1]; // Move from last selected
        if (indices.length > 1 && e.shiftKey) {
            // If range selecting, rely on dragStartIndex if avail, or just last
            if (dragStartIndex.value !== null) curr = dragStartIndex.value;
        }

        const total = filteredEntries.value.length;
        let next = curr;
        let handled = true;

        switch (e.key) {
            case 'ArrowUp': next = Math.max(0, curr - 1); break;
            case 'ArrowDown': next = Math.min(total - 1, curr + 1); break;
            case 'PageUp': next = Math.max(0, curr - 20); break;
            case 'PageDown': next = Math.min(total - 1, curr + 20); break;
            case 'Home': next = 0; break;
            case 'End': next = total - 1; break;
            case 'a':
                if (e.ctrlKey || e.metaKey) {
                    // Select All Visible
                    e.preventDefault();
                    const newSet = new Set<number>();
                    for (let i = 0; i < total; i++) newSet.add(i);
                    selectedRows.value = newSet;
                    return;
                }
                handled = false;
                break;
            case 'c':
                if (e.ctrlKey || e.metaKey) {
                    handleCopy();
                    return; // Default copy handler will fire too, but we interrupt
                }
                handled = false;
                break;
            default: handled = false;
        }

        if (handled) {
            e.preventDefault();
            // Scroll into view
            const rowTop = next * ROW_HEIGHT;
            const rowBottom = rowTop + ROW_HEIGHT;
            const viewport = tableRef.current;
            if (viewport) {
                if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
                else if (rowBottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = rowBottom - viewport.clientHeight;
            }

            // Selection Logic
            if (e.shiftKey) {
                // Range select from dragStartIndex or original curr
                const anchor = dragStartIndex.value ?? curr;
                const newSet = new Set<number>();
                const start = Math.min(anchor, next);
                const end = Math.max(anchor, next);
                for (let i = start; i <= end; i++) newSet.add(i);
                selectedRows.value = newSet;
            } else {
                selectedRows.value = new Set([next]);
                dragStartIndex.value = next; // Reset anchor
            }
        }
    };


    const handleHeaderClick = (col: keyof LogEntry) => {
        if (sortColumn.value === col) {
            sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn.value = col;
            sortDirection.value = 'asc';
        }
    };

    const handleResize = (colId: string, e: MouseEvent) => {
        const col = colId as keyof typeof columnWidths.value;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = columnWidths.value[col];

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            columnWidths.value = {
                ...columnWidths.value,
                [col]: Math.max(50, startWidth + delta)
            };
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // --- Column Drag and Drop ---
    const handleColumnDragStart = (colKey: ColumnKey, e: DragEvent) => {
        draggedColumn.value = colKey;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', colKey);
        // Add a slight delay to show the drag ghost
        const target = e.target as HTMLElement;
        target.classList.add('dragging');
    };

    const handleColumnDragEnd = (e: DragEvent) => {
        const target = e.target as HTMLElement;
        target.classList.remove('dragging');
        draggedColumn.value = null;
        dragOverColumn.value = null;
    };

    const handleColumnDragOver = (colKey: ColumnKey, e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        if (draggedColumn.value && draggedColumn.value !== colKey) {
            dragOverColumn.value = colKey;
        }
    };

    const handleColumnDragLeave = () => {
        dragOverColumn.value = null;
    };

    const handleColumnDrop = (targetColKey: ColumnKey, e: DragEvent) => {
        e.preventDefault();
        const sourceColKey = e.dataTransfer!.getData('text/plain') as ColumnKey;

        if (sourceColKey && sourceColKey !== targetColKey) {
            const newOrder = [...columnOrder.value];
            const sourceIdx = newOrder.indexOf(sourceColKey);
            const targetIdx = newOrder.indexOf(targetColKey);

            if (sourceIdx !== -1 && targetIdx !== -1) {
                // Remove from source and insert at target
                newOrder.splice(sourceIdx, 1);
                newOrder.splice(targetIdx, 0, sourceColKey);
                columnOrder.value = newOrder;
            }
        }

        draggedColumn.value = null;
        dragOverColumn.value = null;
    };

    // --- Mouse Interaction (Click & Drag) ---
    const handleMouseDown = (idx: number, e: MouseEvent) => {
        // Right click doesn't start selection drag usually, just context menu
        if (e.button === 2) return;

        contextMenu.value = { ...contextMenu.value, visible: false };

        if (e.shiftKey) {
            // Range select
            const newSelection = new Set(selectedRows.value);
            const anchor = dragStartIndex.value ?? idx;
            const start = Math.min(anchor, idx);
            const end = Math.max(anchor, idx);
            // If ctrl not held, clear others (standard OS behavior usually clears, but let's be additive if they want? No, standard is clear unless Ctrl)
            if (!e.ctrlKey && !e.metaKey) newSelection.clear();

            for (let i = start; i <= end; i++) newSelection.add(i);
            selectedRows.value = newSelection;
        } else if (e.ctrlKey || e.metaKey) {
            // Toggle
            const newSelection = new Set(selectedRows.value);
            if (newSelection.has(idx)) newSelection.delete(idx);
            else newSelection.add(idx);
            selectedRows.value = newSelection;
            dragStartIndex.value = idx;
        } else {
            // Single select / Start of drag
            isDragging.value = true;
            dragStartIndex.value = idx;
            selectedRows.value = new Set([idx]);
        }
    };

    const handleMouseEnter = (idx: number) => {
        if (isDragging.value && dragStartIndex.value !== null) {
            const start = Math.min(dragStartIndex.value, idx);
            const end = Math.max(dragStartIndex.value, idx);
            const newSet = new Set<number>();
            for (let i = start; i <= end; i++) newSet.add(i);
            selectedRows.value = newSet;
        }
    };

    const handleMouseUp = () => {
        isDragging.value = false;
    };

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);


    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        contextMenu.value = { x: e.clientX, y: e.clientY, visible: true };
    };

    const handleCopy = () => {
        const entries = filteredEntries.value;
        const text = Array.from(selectedRows.value)
            .sort((a, b) => a - b)
            .map(idx => {
                const e = entries[idx];
                return e ? `${formatDateTime(e.timestamp)}\t${e.deviceId}\t${e.signalName}\t${e.value}` : '';
            })
            .join('\n');

        navigator.clipboard.writeText(text);
        contextMenu.value = { ...contextMenu.value, visible: false };
    };

    const handleAddToWaveform = () => {
        const entries = filteredEntries.value;
        const processed = new Set<string>();

        Array.from(selectedRows.value).forEach(idx => {
            const e = entries[idx];
            if (e) {
                const key = `${e.deviceId}::${e.signalName}`;
                if (!processed.has(key)) {
                    toggleSignal(e.deviceId, e.signalName);
                    processed.add(key);
                }
            }
        });
        contextMenu.value = { ...contextMenu.value, visible: false };
    };

    // --- Search Highlight Helper ---
    const HighlightText = ({ text }: { text: string }) => {
        const query = searchQuery.value;
        if (!query) return <span>{text}</span>;

        if (searchRegex.value) {
            try {
                const flags = searchCaseSensitive.value ? 'g' : 'gi';
                const regex = new RegExp(`(${query})`, flags);
                const parts = text.split(regex);
                return (
                    <span>
                        {parts.map((part, i) =>
                            regex.test(part) ? <mark key={i} className="highlight-match">{part}</mark> : part
                        )}
                    </span>
                );
            } catch {
                return <span>{text}</span>;
            }
        } else {
            // Simple string highlight
            if (!text) return <span></span>;
            const lowerText = searchCaseSensitive.value ? text : text.toLowerCase();
            const lowerQuery = searchCaseSensitive.value ? query : query.toLowerCase();
            const index = lowerText.indexOf(lowerQuery);

            if (index === -1) return <span>{text}</span>;

            const before = text.substring(0, index);
            const match = text.substring(index, index + query.length);
            const after = text.substring(index + query.length);

            return (
                <span>
                    {before}
                    <mark className="highlight-match">{match}</mark>
                    <HighlightText text={after} />
                </span>
            );
        }
    };


    // Viewport calculations - ALWAYS use scrollSignal to ensure re-renders on scroll
    const viewportHeight = tableRef.current?.clientHeight || 600;
    const totalCount = useServerSide.value ? totalEntries.value : filteredEntries.value.length;
    const totalHeight = totalCount * ROW_HEIGHT;

    // Use scrollSignal to ensure component re-renders when scroll position changes
    const currentScroll = scrollSignal.value;

    const startIdx = useServerSide.value
        ? 0
        : Math.max(0, Math.floor(currentScroll / ROW_HEIGHT) - BUFFER);

    const endIdx = useServerSide.value
        ? filteredEntries.value.length
        : Math.min(totalCount, Math.ceil((currentScroll + viewportHeight) / ROW_HEIGHT) + BUFFER);

    const visibleEntries = filteredEntries.value.slice(startIdx, endIdx);

    // For server-side, calculate offset based on current page position
    const offsetTop = useServerSide.value
        ? Math.floor(currentScroll / (SERVER_PAGE_SIZE * ROW_HEIGHT)) * SERVER_PAGE_SIZE * ROW_HEIGHT
        : startIdx * ROW_HEIGHT;

    return (
        <div className="log-table-container"
            onKeyDown={handleKeyDown}
            onClick={() => contextMenu.value = { ...contextMenu.value, visible: false }}
            tabIndex={0}>

            <div className="log-table-toolbar">
                <div className="toolbar-left">
                    <div className="search-box">
                        <span className="search-icon"><SearchIcon size={14} /></span>
                        <input
                            type="text"
                            placeholder="Filter signals, devices, values..."
                            value={localQuery}
                            onInput={(e) => setLocalQuery((e.target as HTMLInputElement).value)}
                        />
                    </div>
                    <div className="filter-options">
                        <label className={`filter-toggle ${searchRegex.value ? 'active' : ''}`} title="Use Regular Expression for search">
                            <input
                                type="checkbox"
                                checked={searchRegex.value}
                                onChange={(e) => searchRegex.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            <span className="toggle-label">Regex</span>
                        </label>
                        <label className={`filter-toggle ${searchCaseSensitive.value ? 'active' : ''}`} title="Case Sensitive Search">
                            <input
                                type="checkbox"
                                checked={searchCaseSensitive.value}
                                onChange={(e) => searchCaseSensitive.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            <span className="toggle-label">Aa</span>
                        </label>
                        <label className={`filter-toggle ${showChangedOnly.value ? 'active' : ''}`} title="Show only entries where signal values changed">
                            <input
                                type="checkbox"
                                checked={showChangedOnly.value}
                                onChange={(e) => showChangedOnly.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            <span className="toggle-label">Changes Only</span>
                        </label>
                    </div>
                </div>
                <div className="toolbar-actions">
                    <span className="selection-count">
                        {selectedRows.value.size > 0 && `${selectedRows.value.size} selected`}
                    </span>
                    <div className="toolbar-jump">
                        <button className="btn-jump-to-time" onClick={() => jumpToTimeOpen.value = !jumpToTimeOpen.value} title="Jump to point in time (Ctrl+Shift+G)">
                            <ClockIcon />
                            <span>Jump to Time</span>
                            <kbd>Ctrl+Shift+G</kbd>
                        </button>
                        {jumpToTimeOpen.value && (
                            <JumpToTimePopover
                                onClose={() => jumpToTimeOpen.value = false}
                                onJump={async (ts) => {
                                    const index = await jumpToTime(ts);
                                    if (index !== null && tableRef.current) {
                                        tableRef.current.scrollTop = index * ROW_HEIGHT;
                                        // Brief highlight or selection
                                        selectedRows.value = new Set([index]);
                                    }
                                }}
                            />
                        )}
                    </div>
                    <div className="toolbar-separator"></div>
                    <button className="btn-icon" onClick={() => openView('waveform')} title="Open Timing Diagram"><ChartIcon /></button>
                    <button className="btn-icon" onClick={handleCopy} title="Copy selected (Ctrl+C)"><CopyIcon /></button>
                    <button className="btn-icon" onClick={() => fetchEntries(1, 1000)} title="Reload data"><RefreshIcon /></button>
                </div>
            </div>

            <div className="log-table-view-split">
                <SignalSidebar />
                <div className="log-table-content">
                    <div className="log-table-header">
                        {columnOrder.value.map((colKey) => {
                            const col = COLUMNS.find(c => c.key === colKey)!;
                            const isDragOver = dragOverColumn.value === colKey;
                            const isDraggingCol = draggedColumn.value === colKey;

                            // Special rendering for category column with filter popover
                            if (col.key === 'category') {
                                return (
                                    <div
                                        key={col.key}
                                        className={`log-col col-cat ${categoryFilter.value.size > 0 ? 'filter-active' : ''} ${isDragOver ? 'drag-over' : ''} ${isDraggingCol ? 'dragging' : ''}`}
                                        style={{ width: columnWidths.value[col.id as keyof typeof columnWidths.value] }}
                                        draggable
                                        onDragStart={(e) => handleColumnDragStart(col.key, e)}
                                        onDragEnd={handleColumnDragEnd}
                                        onDragOver={(e) => handleColumnDragOver(col.key, e)}
                                        onDragLeave={handleColumnDragLeave}
                                        onDrop={(e) => handleColumnDrop(col.key, e)}
                                        title="Drag to reorder"
                                    >
                                        <span className="col-header-text" onClick={() => handleHeaderClick('category')}>
                                            {col.label} {sortColumn.value === 'category' && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                                        </span>
                                        <button
                                            className={`category-filter-btn ${categoryFilter.value.size > 0 ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                categoryFilterOpen.value = !categoryFilterOpen.value;
                                            }}
                                            title="Filter by category"
                                        >
                                            <FilterIcon size={12} />
                                            {categoryFilter.value.size > 0 && (
                                                <span className="filter-badge">{categoryFilter.value.size}</span>
                                            )}
                                        </button>
                                        {categoryFilterOpen.value && <CategoryFilterPopover onClose={() => categoryFilterOpen.value = false} />}
                                        {col.resizable && <div className="resize-handle" onMouseDown={(e) => handleResize(col.id, e)} />}
                                    </div>
                                );
                            }

                            // Standard rendering for other columns
                            return (
                                <div
                                    key={col.key}
                                    className={`log-col col-${col.id} ${isDragOver ? 'drag-over' : ''} ${isDraggingCol ? 'dragging' : ''}`}
                                    style={{ width: columnWidths.value[col.id as keyof typeof columnWidths.value] }}
                                    onClick={() => col.sortable && handleHeaderClick(col.key as keyof LogEntry)}
                                    draggable
                                    onDragStart={(e) => handleColumnDragStart(col.key, e)}
                                    onDragEnd={handleColumnDragEnd}
                                    onDragOver={(e) => handleColumnDragOver(col.key, e)}
                                    onDragLeave={handleColumnDragLeave}
                                    onDrop={(e) => handleColumnDrop(col.key, e)}
                                    title="Drag to reorder"
                                >
                                    {col.label} {col.sortable && sortColumn.value === col.key && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                                    {col.resizable && <div className="resize-handle" onMouseDown={(e) => handleResize(col.id, e)} />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="log-table-viewport" ref={tableRef} onScroll={onScroll}>
                        <div className="log-table-spacer" style={{ height: `${totalHeight}px` }}>
                            <div className="log-table-rows" style={{ transform: `translateY(${offsetTop}px)` }}>
                                {visibleEntries.map((entry, i) => {
                                    const actualIdx = startIdx + i;
                                    const isSelected = selectedRows.value.has(actualIdx);
                                    return (
                                        <div
                                            key={actualIdx}
                                            className={`log-table-row ${isSelected ? 'selected' : ''}`}
                                            onMouseDown={(e) => handleMouseDown(actualIdx, e)}
                                            onMouseEnter={() => handleMouseEnter(actualIdx)}
                                            onContextMenu={handleContextMenu}
                                        >
                                            {columnOrder.value.map((colKey) => {
                                                const col = COLUMNS.find(c => c.key === colKey)!;
                                                const width = columnWidths.value[col.id as keyof typeof columnWidths.value];

                                                switch (col.key) {
                                                    case 'timestamp':
                                                        return <div key={col.key} className="log-col" style={{ width }}>{formatDateTime(entry.timestamp)}</div>;
                                                    case 'deviceId':
                                                        return <div key={col.key} className="log-col" style={{ width }}><HighlightText text={entry.deviceId} /></div>;
                                                    case 'signalName':
                                                        return <div key={col.key} className="log-col" style={{ width }}><HighlightText text={entry.signalName} /></div>;
                                                    case 'category':
                                                        return <div key={col.key} className="log-col" style={{ width }}><HighlightText text={entry.category || ''} /></div>;
                                                    case 'value':
                                                        return <div key={col.key} className={`log-col val-${entry.signalType}`} style={{ width }}><HighlightText text={String(entry.value)} /></div>;
                                                    case 'type':
                                                        return <div key={col.key} className="log-col" style={{ width }}>{entry.signalType}</div>;
                                                    default:
                                                        return null;
                                                }
                                            })}
                                        </div>
                                    );
                                })},
                            </div>
                        </div>
                    </div>

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

                    {/* Server-side page fetching indicator */}
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

                    {contextMenu.value.visible && (
                        <div className="context-menu" style={{ top: contextMenu.value.y, left: contextMenu.value.x }}>
                            <div className="menu-item" onClick={handleAddToWaveform}>Add to Waveform</div>
                            <div className="menu-item" onClick={handleCopy}>Copy Selected Rows</div>
                            <div className="menu-item" onClick={() => { selectedRows.value = new Set(); contextMenu.value = { ...contextMenu.value, visible: false }; }}>Clear Selection</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

