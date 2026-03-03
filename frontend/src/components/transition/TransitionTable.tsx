/**
 * TransitionTable - Table view of transition results
 */
import { useSignal } from '@preact/signals';
import { CopyIcon, GridIcon } from '../icons';
import { filteredResults, type TransitionResult } from '../../stores/transitionStore';

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
        if (ms >= 60000) {
            return `${(ms / 60000).toFixed(2)}m`;
        }
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms.toFixed(0)}ms`;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'ok':
                return <span class="status-icon ok">✓</span>;
            case 'above':
                return <span class="status-icon above">▲</span>;
            case 'below':
                return <span class="status-icon below">▼</span>;
            default:
                return <span class="status-icon no-target">—</span>;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'ok': return 'OK';
            case 'above': return 'High';
            case 'below': return 'Low';
            default: return 'N/A';
        }
    };

    const setActionMessage = (message: string) => {
        actionMessage.value = message;
        window.setTimeout(() => {
            if (actionMessage.value === message) {
                actionMessage.value = '';
            }
        }, 2000);
    };

    const handleCopy = async () => {
        const text = buildTsv(results);

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            setActionMessage(`Copied ${results.length} rows`);
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
        setActionMessage(copied ? `Copied ${results.length} rows` : 'Copy failed');
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
            <div class="table-empty">
                <p>No transitions found for the current configuration.</p>
            </div>
        );
    }

    return (
        <div class="transition-table-container">
            <div class="transition-table-toolbar" role="toolbar" aria-label="Table actions">
                <span class="selection-count">{results.length} rows</span>
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
                        class="btn-icon btn-icon-wide"
                        aria-label="Export table rows as CSV"
                        title="Export current table rows as CSV"
                        onClick={handleExportCsv}
                    >
                        <GridIcon size={14} />
                        <span>CSV</span>
                    </button>
                </div>
                {actionMessage.value && (
                    <span class="table-action-message">{actionMessage.value}</span>
                )}
            </div>

            <table class="transition-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Start Time</th>
                        <th>End Time</th>
                        <th>Duration</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result, index) => (
                        <tr key={`${result.configName}-${result.startTime}`} class={`status-${result.status}`}>
                            <td class="cell-num">{index + 1}</td>
                            <td class="cell-time">{formatTime(result.startTime)}</td>
                            <td class="cell-time">{formatTime(result.endTime)}</td>
                            <td class="cell-duration">{formatDuration(result.duration)}</td>
                            <td class="cell-status">
                                {getStatusIcon(result.status)}
                                {getStatusLabel(result.status)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <style>{`
                .transition-table-container {
                    overflow: auto;
                    height: 100%;
                }

                .transition-table-toolbar {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-sm);
                }

                .toolbar-actions {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .selection-count {
                    font-size: 11px;
                    color: var(--primary-accent);
                    font-family: var(--font-sans);
                    font-weight: 600;
                    background: rgba(77, 182, 226, 0.1);
                    padding: 2px 8px;
                    border-radius: 10px;
                }

                .btn-icon {
                    background: transparent;
                    border: 1px solid transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--border-radius);
                    width: 32px;
                    height: 32px;
                    transition: all var(--transition-fast);
                }

                .btn-icon:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                    border-color: var(--border-light);
                }

                .btn-icon:active {
                    transform: translateY(1px);
                }

                .btn-icon-wide {
                    width: auto;
                    padding: 0 10px;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .table-action-message {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .table-empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--text-muted);
                }

                .transition-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }

                .transition-table th {
                    position: sticky;
                    top: 0;
                    background: var(--bg-tertiary);
                    padding: 10px 12px;
                    text-align: left;
                    font-weight: 600;
                    color: var(--text-secondary);
                    border-bottom: 1px solid var(--border-color);
                }

                .transition-table td {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--border-color);
                    color: var(--text-primary);
                }

                .transition-table tr:hover {
                    background: var(--bg-secondary);
                }

                .cell-num {
                    color: var(--text-muted);
                    width: 50px;
                }

                .cell-time {
                    font-family: var(--font-mono);
                    color: var(--text-secondary);
                }

                .cell-duration {
                    font-family: var(--font-mono);
                    font-weight: 600;
                }

                .cell-status {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .status-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: bold;
                }

                .status-icon.ok {
                    background: rgba(52, 168, 83, 0.2);
                    color: #34A853;
                }

                .status-icon.above {
                    background: rgba(234, 67, 53, 0.2);
                    color: #EA4335;
                }

                .status-icon.below {
                    background: rgba(251, 188, 4, 0.2);
                    color: #FBBC04;
                }

                .status-icon.no-target {
                    background: var(--bg-tertiary);
                    color: var(--text-muted);
                }

                tr.status-above .cell-duration {
                    color: #EA4335;
                }

                tr.status-below .cell-duration {
                    color: #FBBC04;
                }

                tr.status-ok .cell-duration {
                    color: #34A853;
                }
            `}</style>
        </div>
    );
}
