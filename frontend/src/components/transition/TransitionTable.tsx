/**
 * TransitionTable - Table view of transition results
 * Uses the same visual structure and CSS as LogTable.
 */
import { useSignal } from '@preact/signals';
import { CopyIcon, GridIcon } from '../icons';
import { filteredResults, type TransitionResult } from '../../stores/transitionStore';
import { useRowSelection } from '../log/hooks';
import '../log/LogTable.css';

// Column widths (px), matching LogTable's fixed-width column style
const COL_NUM = 48;
const COL_TIME = 130;
const COL_DURATION = 100;
const COL_STATUS = 90;

function toRowValues(result: TransitionResult): string[] {
    return [
        new Date(result.startTime).toISOString(),
        new Date(result.endTime).toISOString(),
        String(result.duration),
        result.status
    ];
}

function escapeCsvCell(value: string): string {
    if (!/[",\r\n]/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(results: TransitionResult[]): string {
    const headers = ['Start Time (ISO)', 'End Time (ISO)', 'Duration (ms)', 'Status'];
    const rows = results.map(toRowValues);
    const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
    return `${lines.join('\n')}\n`;
}

function sanitizeTsvCell(value: string): string {
    return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function buildTsv(results: TransitionResult[]): string {
    const headers = ['Start Time (ISO)', 'End Time (ISO)', 'Duration (ms)', 'Status'];
    const rows = results.map(toRowValues);
    const lines = [headers, ...rows].map((row) => row.map(sanitizeTsvCell).join('\t'));
    return `${lines.join('\n')}\n`;
}

export function TransitionTable() {
    const results = filteredResults.value;
    const actionMessage = useSignal('');
    const { state: sel, actions } = useRowSelection();

    const formatTime = (ms: number) => {
        const date = new Date(ms);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        } as Intl.DateTimeFormatOptions);
    };

    const formatDuration = (ms: number) => {
        if (ms >= 60000) return `${(ms / 60000).toFixed(2)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms.toFixed(0)}ms`;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'ok':    return <span class="tr-status-icon ok">✓</span>;
            case 'above': return <span class="tr-status-icon above">▲</span>;
            case 'below': return <span class="tr-status-icon below">▼</span>;
            default:      return <span class="tr-status-icon no-target">—</span>;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'ok':    return 'OK';
            case 'above': return 'High';
            case 'below': return 'Low';
            default:      return 'N/A';
        }
    };

    const setActionMessage = (message: string) => {
        actionMessage.value = message;
        window.setTimeout(() => {
            if (actionMessage.value === message) actionMessage.value = '';
        }, 2000);
    };

    const handleCopy = async () => {
        const target = sel.hasSelection ? actions.getSelectedData(results) : results;
        const text = buildTsv(target);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            setActionMessage(`Copied ${target.length} rows`);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        setActionMessage(copied ? `Copied ${target.length} rows` : 'Copy failed');
    };

    const handleExportCsv = () => {
        const csv = buildCsv(results);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = url;
        anchor.download = `transition-results-${stamp}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setActionMessage(`Exported ${results.length} rows`);
    };

    if (results.length === 0) {
        return (
            <div class="log-empty-state" style={{ position: 'relative' }}>
                <p>No transitions found for the current configuration.</p>
            </div>
        );
    }

    return (
        <div class="log-table-container" tabIndex={-1}>
            {/* Toolbar */}
            <div class="log-table-toolbar">
                <div class="toolbar-left">
                    <span class="selection-count">
                        {sel.hasSelection ? `${sel.selectionCount} / ${results.length} rows` : `${results.length} rows`}
                    </span>
                </div>
                <div class="toolbar-actions">
                    <button
                        class="btn-icon"
                        aria-label="Copy table rows"
                        title="Copy current table rows"
                        onClick={() => void handleCopy()}
                    >
                        <CopyIcon size={14} />
                    </button>
                    <button
                        class="btn-icon tr-btn-wide"
                        aria-label="Export table rows as CSV"
                        title="Export current table rows as CSV"
                        onClick={handleExportCsv}
                    >
                        <GridIcon size={14} />
                        <span>CSV</span>
                    </button>
                    {actionMessage.value && (
                        <span class="tr-action-msg">{actionMessage.value}</span>
                    )}
                </div>
            </div>

            {/* Header */}
            <div class="log-table-header" role="rowgroup">
                <div class="log-col" style={{ width: COL_NUM }} role="columnheader">#</div>
                <div class="log-col" style={{ width: COL_TIME }} role="columnheader">Start Time</div>
                <div class="log-col" style={{ width: COL_TIME }} role="columnheader">End Time</div>
                <div class="log-col" style={{ width: COL_DURATION }} role="columnheader">Duration</div>
                <div class="log-col" style={{ width: COL_STATUS }} role="columnheader">Status</div>
            </div>

            {/* Rows */}
            <div class="log-table-viewport">
                {results.map((result, index) => (
                    <div
                        key={`${result.startTime}-${result.endTime}`}
                        class={`log-table-row tr-status-${result.status}${actions.isSelected(index) ? ' selected' : ''}`}
                        role="row"
                        onClick={(e) => actions.handleRowClick(e as unknown as MouseEvent, index)}
                    >
                        <div class="log-col tr-col-num" style={{ width: COL_NUM }}>{index + 1}</div>
                        <div class="log-col tr-col-time" style={{ width: COL_TIME }}>{formatTime(result.startTime)}</div>
                        <div class="log-col tr-col-time" style={{ width: COL_TIME }}>{formatTime(result.endTime)}</div>
                        <div class="log-col tr-col-duration" style={{ width: COL_DURATION }}>{formatDuration(result.duration)}</div>
                        <div class="log-col tr-col-status" style={{ width: COL_STATUS }}>
                            {getStatusIcon(result.status)}
                            {getStatusLabel(result.status)}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                /* Wide CSV button */
                .tr-btn-wide {
                    width: auto;
                    padding: 0 10px;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .tr-action-msg {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                /* Column typography */
                .tr-col-num   { color: var(--text-muted); }
                .tr-col-time  { font-family: var(--font-mono); color: var(--text-secondary); }
                .tr-col-duration { font-family: var(--font-mono); font-weight: 600; }
                .tr-col-status {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                }

                /* Duration color by status */
                .tr-status-ok    .tr-col-duration { color: #34A853; }
                .tr-status-above .tr-col-duration { color: #EA4335; }
                .tr-status-below .tr-col-duration { color: #FBBC04; }

                /* Status icons */
                .tr-status-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: bold;
                    flex-shrink: 0;
                }
                .tr-status-icon.ok       { background: rgba(52,168,83,0.2);  color: #34A853; }
                .tr-status-icon.above    { background: rgba(234,67,53,0.2);  color: #EA4335; }
                .tr-status-icon.below    { background: rgba(251,188,4,0.2);  color: #FBBC04; }
                .tr-status-icon.no-target { background: var(--bg-tertiary); color: var(--text-muted); }
            `}</style>
        </div>
    );
}
