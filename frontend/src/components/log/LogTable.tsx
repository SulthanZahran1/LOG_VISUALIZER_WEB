import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import {
    filteredEntries,
    isLoadingLog,
    sortColumn,
    sortDirection,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    isSplitHorizontal,
    isSplitVertical,
    signalTypeFilter,
    fetchEntries
} from '../../stores/logStore';
import type { LogEntry } from '../../models/types';
import './LogTable.css';

const ROW_HEIGHT = 24;
const BUFFER = 10;

/**
 * Performant Log Table with Virtual Scrolling
 */
export function LogTable() {
    const tableRef = useRef<HTMLDivElement>(null);
    const scrollSignal = useSignal(0);
    const selectedRows = useSignal<Set<number>>(new Set());
    const columnWidths = useSignal({
        ts: 220,
        dev: 180,
        sig: 300,
        val: 150,
        type: 100
    });
    const contextMenu = useSignal<{ x: number, y: number, visible: boolean }>({ x: 0, y: 0, visible: false });

    const onScroll = (e: Event) => {
        scrollSignal.value = (e.target as HTMLDivElement).scrollTop;
        if (contextMenu.value.visible) contextMenu.value = { ...contextMenu.value, visible: false };
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

    const handleRowClick = (idx: number, e: MouseEvent) => {
        contextMenu.value = { ...contextMenu.value, visible: false };
        const newSelection = new Set(selectedRows.value);
        if (e.shiftKey) {
            const lastIdx = Array.from(newSelection).pop() || 0;
            const start = Math.min(lastIdx, idx);
            const end = Math.max(lastIdx, idx);
            for (let i = start; i <= end; i++) newSelection.add(i);
        } else if (e.metaKey || e.ctrlKey) {
            if (newSelection.has(idx)) newSelection.delete(idx);
            else newSelection.add(idx);
        } else {
            newSelection.clear();
            newSelection.add(idx);
        }
        selectedRows.value = newSelection;
    };

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
                return e ? `${e.timestamp}\t${e.deviceId}\t${e.signalName}\t${e.value}` : '';
            })
            .join('\n');

        navigator.clipboard.writeText(text);
        contextMenu.value = { ...contextMenu.value, visible: false };
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
            onKeyDown={(e) => e.ctrlKey && e.key === 'c' && handleCopy()}
            onClick={() => contextMenu.value = { ...contextMenu.value, visible: false }}
            tabIndex={0}>

            <div className="log-table-toolbar">
                <div className="toolbar-left">
                    <div className="search-box">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Filter signals, devices, values..."
                            value={searchQuery.value}
                            onInput={(e) => searchQuery.value = (e.target as HTMLInputElement).value}
                        />
                    </div>
                    <div className="filter-options">
                        <label className="filter-toggle" title="Regex Mode">
                            <input
                                type="checkbox"
                                checked={searchRegex.value}
                                onChange={(e) => searchRegex.value = (e.target as HTMLInputElement).checked}
                            />
                            Regex
                        </label>
                        <label className="filter-toggle" title="Case Sensitive">
                            <input
                                type="checkbox"
                                checked={searchCaseSensitive.value}
                                onChange={(e) => searchCaseSensitive.value = (e.target as HTMLInputElement).checked}
                            />
                            Aa
                        </label>
                        <label className="filter-toggle" title="Show Changed Only">
                            <input
                                type="checkbox"
                                checked={showChangedOnly.value}
                                onChange={(e) => showChangedOnly.value = (e.target as HTMLInputElement).checked}
                            />
                            Changes Only
                        </label>
                        <select
                            className="type-filter"
                            value={signalTypeFilter.value || ''}
                            onChange={(e) => signalTypeFilter.value = (e.target as HTMLSelectElement).value || null}
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
                    <button className={`btn-icon ${isSplitHorizontal.value ? 'active' : ''}`} onClick={() => { isSplitHorizontal.value = !isSplitHorizontal.value; isSplitVertical.value = false; }} title="Split Horizontal">◫</button>
                    <button className={`btn-icon ${isSplitVertical.value ? 'active' : ''}`} onClick={() => { isSplitVertical.value = !isSplitVertical.value; isSplitHorizontal.value = false; }} title="Split Vertical">◴</button>
                    <button className="btn-icon" onClick={handleCopy} title="Copy selected (Ctrl+C)">📋</button>
                    <button className="btn-icon" onClick={() => fetchEntries(1, 1000)} title="Reload data">🔄</button>
                </div>
            </div>

            <div className="log-table-header">
                <div className="log-col" style={{ width: columnWidths.value.ts }} onClick={() => handleHeaderClick('timestamp')}>
                    TIMESTAMP {sortColumn.value === 'timestamp' && (sortDirection.value === 'asc' ? '↑' : '↓')}
                    <div className="resize-handle" onMouseDown={(e) => handleResize('ts', e)} />
                </div>
                <div className="log-col" style={{ width: columnWidths.value.dev }} onClick={() => handleHeaderClick('deviceId')}>
                    DEVICE ID {sortColumn.value === 'deviceId' && (sortDirection.value === 'asc' ? '↑' : '↓')}
                    <div className="resize-handle" onMouseDown={(e) => handleResize('dev', e)} />
                </div>
                <div className="log-col" style={{ width: columnWidths.value.sig }} onClick={() => handleHeaderClick('signalName')}>
                    SIGNAL NAME {sortColumn.value === 'signalName' && (sortDirection.value === 'asc' ? '↑' : '↓')}
                    <div className="resize-handle" onMouseDown={(e) => handleResize('sig', e)} />
                </div>
                <div className="log-col" style={{ width: columnWidths.value.val }}>
                    VALUE
                    <div className="resize-handle" onMouseDown={(e) => handleResize('val', e)} />
                </div>
                <div className="log-col" style={{ width: columnWidths.value.type }}>TYPE</div>
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
                                    onClick={(e) => handleRowClick(actualIdx, e)}
                                    onContextMenu={handleContextMenu}
                                >
                                    <div className="log-col" style={{ width: columnWidths.value.ts }}>{entry.timestamp}</div>
                                    <div className="log-col" style={{ width: columnWidths.value.dev }}>{entry.deviceId}</div>
                                    <div className="log-col" style={{ width: columnWidths.value.sig }}>{entry.signalName}</div>
                                    <div className="log-col" style={{ width: columnWidths.value.val }}>{entry.value}</div>
                                    <div className="log-col" style={{ width: columnWidths.value.type }}>{entry.signalType}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {isLoadingLog.value && (
                <div className="log-loading-overlay">
                    <div className="loader"></div>
                    <span>Processing Log...</span>
                </div>
            )}

            {!isLoadingLog.value && totalCount === 0 && (
                <div className="log-empty-state">
                    {searchQuery.value ? 'No entries match your filter' : 'No entries found'}
                </div>
            )}

            {contextMenu.value.visible && (
                <div className="context-menu" style={{ top: contextMenu.value.y, left: contextMenu.value.x }}>
                    <div className="menu-item" onClick={handleCopy}>Copy Selected Rows</div>
                    <div className="menu-item" onClick={() => { selectedRows.value = new Set(); contextMenu.value = { ...contextMenu.value, visible: false }; }}>Clear Selection</div>
                </div>
            )}
        </div>
    );
}
