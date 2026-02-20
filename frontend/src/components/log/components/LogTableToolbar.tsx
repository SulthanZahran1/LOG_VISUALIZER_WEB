/**
 * LogTableToolbar Component
 * 
 * Toolbar with search, filters, and actions for the log table.
 */
import { SearchIcon, ChartIcon, CopyIcon, RefreshIcon, ClockIcon } from '../../icons';
import { ColorCodingSettings } from '../../settings/ColorCodingSettings';
import type { SearchFilterState } from '../hooks/useSearchFilter';

export interface LogTableToolbarProps {
    /** Search filter state */
    searchState: SearchFilterState;
    /** Update search query */
    onSearchChange: (query: string) => void;
    /** Toggle regex mode */
    onToggleRegex: () => void;
    /** Toggle case sensitivity */
    onToggleCaseSensitive: () => void;
    /** Toggle show changed only */
    onToggleShowChangedOnly: () => void;
    /** Toggle highlight mode */
    onToggleHighlightMode: () => void;
    /** Number of selected rows */
    selectionCount: number;
    /** Jump to time open state */
    jumpToTimeOpen: boolean;
    /** Toggle jump to time */
    onToggleJumpToTime: () => void;
    /** Open waveform view */
    onOpenWaveform: () => void;
    /** Copy selected rows */
    onCopy: () => void;
    /** Reload data */
    onReload: () => void;
}

/**
 * Toolbar component for LogTable
 */
export function LogTableToolbar({
    searchState,
    onSearchChange,
    onToggleRegex,
    onToggleCaseSensitive,
    onToggleShowChangedOnly,
    onToggleHighlightMode,
    selectionCount,
    jumpToTimeOpen,
    onToggleJumpToTime,
    onOpenWaveform,
    onCopy,
    onReload
}: LogTableToolbarProps) {
    return (
        <div className="log-table-toolbar">
            <div className="toolbar-left">
                <div className="search-box">
                    <span className="search-icon"><SearchIcon size={14} /></span>
                    <input
                        type="text"
                        placeholder="Filter signals, devices, values..."
                        value={searchState.localQuery}
                        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
                    />
                </div>
                <div className="filter-options">
                    <label
                        className={`filter-toggle ${searchState.useRegex ? 'active' : ''}`}
                        title="Use Regular Expression"
                    >
                        <input
                            type="checkbox"
                            checked={searchState.useRegex}
                            onChange={onToggleRegex}
                        />
                        <span className="toggle-label">Regex</span>
                    </label>
                    <label
                        className={`filter-toggle ${searchState.caseSensitive ? 'active' : ''}`}
                        title="Case Sensitive"
                    >
                        <input
                            type="checkbox"
                            checked={searchState.caseSensitive}
                            onChange={onToggleCaseSensitive}
                        />
                        <span className="toggle-label">Aa</span>
                    </label>
                    <label
                        className={`filter-toggle ${searchState.showChangedOnly ? 'active' : ''}`}
                        title="Show Changed Only"
                    >
                        <input
                            type="checkbox"
                            checked={searchState.showChangedOnly}
                            onChange={onToggleShowChangedOnly}
                        />
                        <span className="toggle-label">Changes Only</span>
                    </label>
                    <label
                        className={`filter-toggle ${searchState.highlightMode ? 'active' : ''}`}
                        title="Highlight Matches"
                    >
                        <input
                            type="checkbox"
                            checked={searchState.highlightMode}
                            onChange={onToggleHighlightMode}
                        />
                        <span className="toggle-label">Highlight</span>
                    </label>
                </div>
            </div>
            <div className="toolbar-actions">
                <span className="selection-count">
                    {selectionCount > 0 && `${selectionCount} selected`}
                </span>
                <div className="toolbar-jump">
                    <button
                        className={`btn-jump-to-time ${jumpToTimeOpen ? 'active' : ''}`}
                        onClick={onToggleJumpToTime}
                        title="Jump to Time (Ctrl+Shift+G)"
                    >
                        <ClockIcon />
                        <span>Jump to Time</span>
                        <kbd>Ctrl+Shift+G</kbd>
                    </button>
                </div>
                <div className="toolbar-separator"></div>
                <ColorCodingSettings />
                <div className="toolbar-separator"></div>
                <button className="btn-icon" onClick={onOpenWaveform} title="Open Waveform">
                    <ChartIcon />
                </button>
                <button className="btn-icon" onClick={onCopy} title="Copy (Ctrl+C)">
                    <CopyIcon />
                </button>
                <button className="btn-icon" onClick={onReload} title="Reload">
                    <RefreshIcon />
                </button>
            </div>
        </div>
    );
}

export default LogTableToolbar;
