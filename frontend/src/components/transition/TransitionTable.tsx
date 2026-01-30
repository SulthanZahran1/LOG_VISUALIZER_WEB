/**
 * TransitionTable - Table view of transition results
 */
import { filteredResults } from '../../stores/transitionStore';

export function TransitionTable() {
    const results = filteredResults.value;

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

    if (results.length === 0) {
        return (
            <div class="table-empty">
                <p>No transitions found for the current rules.</p>
            </div>
        );
    }

    return (
        <div class="transition-table-container">
            <table class="transition-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Rule</th>
                        <th>Start Time</th>
                        <th>End Time</th>
                        <th>Duration</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result, index) => (
                        <tr key={`${result.ruleId}-${result.startTime}`} class={`status-${result.status}`}>
                            <td class="cell-num">{index + 1}</td>
                            <td class="cell-rule">{result.ruleName}</td>
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

                .cell-rule {
                    font-weight: 500;
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
