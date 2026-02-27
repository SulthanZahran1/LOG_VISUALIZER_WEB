/**
 * TransitionStats - Statistics panel for transition analysis
 */
import type { TransitionStats as Stats } from '../../stores/transitionStore';

interface TransitionStatsProps {
    stats: Stats | null;
}

export function TransitionStats({ stats }: TransitionStatsProps) {
    const formatDuration = (ms: number) => {
        if (ms >= 60000) return `${(ms / 60000).toFixed(2)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms.toFixed(0)}ms`;
    };

    const formatTimestamp = (ms: number | null) => {
        if (ms === null) return 'N/A';
        return new Date(ms).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    const formatRate = (value: number) => {
        return value.toFixed(1);
    };

    if (!stats || stats.count === 0) {
        return (
            <div class="stats-empty">
                <p>No statistics available. Configure and enable a transition to see results.</p>
            </div>
        );
    }

    return (
        <div class="stats-container">
            <div class="stat-card">
                <div class="stat-header">
                    <h3>{stats.configName}</h3>
                    <span class="stat-count">{stats.count} transitions</span>
                </div>

                <div class="stats-meta">
                    <div class="meta-item">
                        <span class="meta-label">Window Start</span>
                        <span class="meta-value">{formatTimestamp(stats.firstStartTime)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Window End</span>
                        <span class="meta-value">{formatTimestamp(stats.lastEndTime)}</span>
                    </div>
                    {stats.targetLowerBound !== undefined && stats.targetUpperBound !== undefined ? (
                        <div class="meta-item">
                            <span class="meta-label">Target Window</span>
                            <span class="meta-value">
                                {formatDuration(stats.targetLowerBound)} - {formatDuration(stats.targetUpperBound)}
                            </span>
                        </div>
                    ) : (
                        <div class="meta-item">
                            <span class="meta-label">Target Window</span>
                            <span class="meta-value">No target configured</span>
                        </div>
                    )}
                </div>

                <h4 class="section-title">Operational Summary</h4>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Elapsed Window</span>
                        <span class="stat-value">{formatDuration(stats.elapsedTime)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Measured</span>
                        <span class="stat-value">{formatDuration(stats.totalDuration)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Throughput / h</span>
                        <span class="stat-value">{formatRate(stats.throughputPerHour)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Range</span>
                        <span class="stat-value">{formatDuration(stats.range)}</span>
                    </div>
                </div>

                <h4 class="section-title">Distribution</h4>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Min</span>
                        <span class="stat-value">{formatDuration(stats.min)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Max</span>
                        <span class="stat-value">{formatDuration(stats.max)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Average</span>
                        <span class="stat-value highlight">{formatDuration(stats.average)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">P50 (Median)</span>
                        <span class="stat-value">{formatDuration(stats.median)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">P90</span>
                        <span class="stat-value">{formatDuration(stats.p90)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">P95</span>
                        <span class="stat-value">{formatDuration(stats.p95)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Std Dev</span>
                        <span class="stat-value">{formatDuration(stats.stdDev)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">CV</span>
                        <span class="stat-value">{(stats.cv * 100).toFixed(1)}%</span>
                    </div>
                </div>

                {(stats.withinTarget + stats.aboveTarget + stats.belowTarget) > 0 && (
                    <div class="target-compliance">
                        <h4>Target Compliance</h4>
                        <div class="compliance-bars">
                            <div class="compliance-row">
                                <span class="compliance-label ok">Within Target</span>
                                <div class="compliance-bar">
                                    <div
                                        class="compliance-fill ok"
                                        style={{ width: `${stats.withinTargetPct}%` }}
                                    />
                                </div>
                                <span class="compliance-value">
                                    {stats.withinTarget} ({stats.withinTargetPct.toFixed(1)}%)
                                </span>
                            </div>
                            <div class="compliance-row">
                                <span class="compliance-label above">Above Target</span>
                                <div class="compliance-bar">
                                    <div
                                        class="compliance-fill above"
                                        style={{ width: `${stats.aboveTargetPct}%` }}
                                    />
                                </div>
                                <span class="compliance-value">
                                    {stats.aboveTarget} ({stats.aboveTargetPct.toFixed(1)}%)
                                </span>
                            </div>
                            <div class="compliance-row">
                                <span class="compliance-label below">Below Target</span>
                                <div class="compliance-bar">
                                    <div
                                        class="compliance-fill below"
                                        style={{ width: `${stats.belowTargetPct}%` }}
                                    />
                                </div>
                                <span class="compliance-value">
                                    {stats.belowTarget} ({stats.belowTargetPct.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .stats-container {
                    max-width: 560px;
                }

                .stats-empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    color: var(--text-muted);
                }

                .stat-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: var(--spacing-lg);
                }

                .stat-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                }

                .stat-header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .stat-count {
                    font-size: 12px;
                    color: var(--text-muted);
                }

                .stats-meta {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                }

                .meta-item {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    padding: 8px 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .meta-label {
                    font-size: 10px;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }

                .meta-value {
                    font-size: 12px;
                    font-family: var(--font-mono);
                    color: var(--text-secondary);
                }

                .section-title {
                    margin: 0 0 var(--spacing-sm) 0;
                    font-size: 12px;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .stat-label {
                    font-size: 11px;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stat-value {
                    font-size: 18px;
                    font-weight: 600;
                    font-family: var(--font-mono);
                    color: var(--text-primary);
                }

                .stat-value.highlight {
                    color: var(--primary-accent);
                }

                .target-compliance h4 {
                    margin: 0 0 var(--spacing-md) 0;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-secondary);
                }

                .compliance-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .compliance-row {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .compliance-label {
                    width: 100px;
                    font-size: 11px;
                    color: var(--text-secondary);
                }

                .compliance-label.ok { color: #34A853; }
                .compliance-label.above { color: #EA4335; }
                .compliance-label.below { color: #FBBC04; }

                .compliance-bar {
                    flex: 1;
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .compliance-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }

                .compliance-fill.ok { background: #34A853; }
                .compliance-fill.above { background: #EA4335; }
                .compliance-fill.below { background: #FBBC04; }

                .compliance-value {
                    width: 80px;
                    font-size: 11px;
                    font-family: var(--font-mono);
                    color: var(--text-muted);
                    text-align: right;
                }
            `}</style>
        </div>
    );
}
