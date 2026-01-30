
import { useSignal } from '@preact/signals';
import { useRef, useEffect, useState } from 'preact/hooks';
import {
    filteredEntries,
    isLoadingLog,
    sortColumn,
    sortDirection,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    signalTypeFilter,
    fetchEntries,
    openView,
    selectedLogTime,
    isStreaming,
    streamProgress
} from '../../stores/logStore';
import { toggleSignal } from '../../stores/waveformStore';
import { formatDateTime } from '../../utils/TimeAxisUtils';
import type { LogEntry } from '../../models/types';
import { SignalSidebar } from '../waveform/SignalSidebar';
import { SearchIcon, ChartIcon, CopyIcon, RefreshIcon, ChevronUpIcon, ChevronDownIcon } from '../icons';
import './LogTable.css';

const ROW_HEIGHT = 28; // Increased for better readability
const BUFFER = 10;

/**
 * Performant Log Table with Virtual Scrolling and Premium UX
 */
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

    // --- Debounced Search ---
    const [localQuery, setLocalQuery] = useState(searchQuery.value);
    useEffect(() => {
        const handler = setTimeout(() => {
            searchQuery.value = localQuery;
        }, 300);
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

    const onScroll = (e: Event) => {
        scrollSignal.value = (e.target as HTMLDivElement).scrollTop;
        if (contextMenu.value.visible) contextMenu.value = { ...contextMenu.value, visible: false };
    };

    // --- Keyboard Navigation ---
    const handleKeyDown = (e: KeyboardEvent) => {
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

    const handleResize = (col: keyof typeof columnWidths.value, e: MouseEvent) => {
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


    // Viewport calculations
    const viewportHeight = tableRef.current?.clientHeight || 600;
    const totalCount = filteredEntries.value.length;
    const totalHeight = totalCount * ROW_HEIGHT;

    const startIdx = Math.max(0, Math.floor(scrollSignal.value / ROW_HEIGHT) - BUFFER);
    const endIdx = Math.min(totalCount, Math.ceil((scrollSignal.value + viewportHeight) / ROW_HEIGHT) + BUFFER);

    const visibleEntries = filteredEntries.value.slice(startIdx, endIdx);
    const offsetTop = startIdx * ROW_HEIGHT;

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
                        <label className="filter-toggle" title="Regex Mode">
                            <input
                                type="checkbox"
                                checked={searchRegex.value}
                                onClick={(e) => searchRegex.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            Regex
                        </label>
                        <label className="filter-toggle" title="Case Sensitive">
                            <input
                                type="checkbox"
                                checked={searchCaseSensitive.value}
                                onClick={(e) => searchCaseSensitive.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            Aa
                        </label>
                        <label className="filter-toggle" title="Show Changed Only">
                            <input
                                type="checkbox"
                                checked={showChangedOnly.value}
                                onClick={(e) => showChangedOnly.value = (e.currentTarget as HTMLInputElement).checked}
                            />
                            Changes Only
                        </label>
                        <select
                            className="type-filter"
                            value={signalTypeFilter.value || ''}
                            onChange={(e) => signalTypeFilter.value = (e.currentTarget as HTMLSelectElement).value || null}
                        >
                            <option value="">All Types</option>
                            <option value="boolean">Boolean</option>
                            <option value="integer">Integer</option>
                            <option value="string">String</option>
                        </select>
                    </div>
                </div>
                <div className="toolbar-actions">
                    <span className="selection-count">
                        {selectedRows.value.size > 0 && `${selectedRows.value.size} selected`}
                    </span>
                    <button className="btn-icon" onClick={() => openView('waveform')} title="Open Timing Diagram"><ChartIcon /></button>
                    <button className="btn-icon" onClick={handleCopy} title="Copy selected (Ctrl+C)"><CopyIcon /></button>
                    <button className="btn-icon" onClick={() => fetchEntries(1, 1000)} title="Reload data"><RefreshIcon /></button>
                </div>
            </div>

            <div className="log-table-view-split">
                <SignalSidebar />
                <div className="log-table-content">
                    <div className="log-table-header">
                        <div className="log-col col-ts" style={{ width: columnWidths.value.ts }} onClick={() => handleHeaderClick('timestamp')}>
                            TIMESTAMP {sortColumn.value === 'timestamp' && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                            <div className="resize-handle" onMouseDown={(e) => handleResize('ts', e)} />
                        </div>
                        <div className="log-col col-dev" style={{ width: columnWidths.value.dev }} onClick={() => handleHeaderClick('deviceId')}>
                            DEVICE ID {sortColumn.value === 'deviceId' && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                            <div className="resize-handle" onMouseDown={(e) => handleResize('dev', e)} />
                        </div>
                        <div className="log-col col-sig" style={{ width: columnWidths.value.sig }} onClick={() => handleHeaderClick('signalName')}>
                            SIGNAL NAME {sortColumn.value === 'signalName' && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                            <div className="resize-handle" onMouseDown={(e) => handleResize('sig', e)} />
                        </div>
                        <div className="log-col col-cat" style={{ width: columnWidths.value.cat }} onClick={() => handleHeaderClick('category')}>
                            CATEGORY {sortColumn.value === 'category' && (sortDirection.value === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                            <div className="resize-handle" onMouseDown={(e) => handleResize('cat', e)} />
                        </div>
                        <div className="log-col col-val" style={{ width: columnWidths.value.val }}>
                            VALUE
                            <div className="resize-handle" onMouseDown={(e) => handleResize('val', e)} />
                        </div>
                        <div className="log-col col-type" style={{ width: columnWidths.value.type }}>TYPE</div>
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
                                            <div className="log-col" style={{ width: columnWidths.value.ts }}>{formatDateTime(entry.timestamp)}</div>
                                            <div className="log-col" style={{ width: columnWidths.value.dev }}>
                                                <HighlightText text={entry.deviceId} />
                                            </div>
                                            <div className="log-col" style={{ width: columnWidths.value.sig }}>
                                                <HighlightText text={entry.signalName} />
                                            </div>
                                            <div className="log-col" style={{ width: columnWidths.value.cat }}>
                                                <HighlightText text={entry.category || ''} />
                                            </div>
                                            <div className={`log-col val-${entry.signalType}`} style={{ width: columnWidths.value.val }}>
                                                <HighlightText text={String(entry.value)} />
                                            </div>
                                            <div className="log-col" style={{ width: columnWidths.value.type }}>{entry.signalType}</div>
                                        </div>
                                    );
                                })}
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
                                <span>Processing Log...</span>
                            )}
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

