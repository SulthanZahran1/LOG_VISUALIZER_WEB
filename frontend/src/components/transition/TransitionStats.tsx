/**
 * TransitionStats - Statistics panel for transition analysis
 */
import type { TransitionStats as Stats } from '../../stores/transitionStore';

interface TransitionStatsProps {
    stats: Stats[];
}

export function TransitionStats({ stats }: TransitionStatsProps) {
    const formatDuration = (ms: number) => {
        if (ms >= 60000) return `${(ms / 60000).toFixed(2)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms.toFixed(0)}ms`;
    };

    const getPercentage = (value: number, total: number) => {
        if (total === 0) return 0;
        return (value / total) * 100;
    };

    if (stats.length === 0 || stats.every(s => s.count === 0)) {
        return (
            <div class="stats-empty">
                <p>No statistics available. Define and enable rules to see results.</p>
            </div>
        );
    }

    return (
        <div class="stats-container">
            {stats.filter(s => s.count > 0).map(stat => (
                <div key={stat.ruleId} class="stat-card">
                    <div class="stat-header">
                        <h3>{stat.ruleName}</h3>
                        <span class="stat-count">{stat.count} transitions</span>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-item">
                            <span class="stat-label">Min</span>
                            <span class="stat-value">{formatDuration(stat.min)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Max</span>
                            <span class="stat-value">{formatDuration(stat.max)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Average</span>
                            <span class="stat-value highlight">{formatDuration(stat.average)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Std Dev</span>
                            <span class="stat-value">{formatDuration(stat.stdDev)}</span>
                        </div>
                    </div>

                    {(stat.withinTarget + stat.aboveTarget + stat.belowTarget) > 0 && (
                        <div class="target-compliance">
                            <h4>Target Compliance</h4>
                            <div class="compliance-bars">
                                <div class="compliance-row">
                                    <span class="compliance-label ok">Within Target</span>
                                    <div class="compliance-bar">
                                        <div
                                            class="compliance-fill ok"
                                            style={{ width: `${getPercentage(stat.withinTarget, stat.count)}%` }}
                                        />
                                    </div>
                                    <span class="compliance-value">
                                        {stat.withinTarget} ({getPercentage(stat.withinTarget, stat.count).toFixed(1)}%)
                                    </span>
                                </div>
                                <div class="compliance-row">
                                    <span class="compliance-label above">Above Target</span>
                                    <div class="compliance-bar">
                                        <div
                                            class="compliance-fill above"
                                            style={{ width: `${getPercentage(stat.aboveTarget, stat.count)}%` }}
                                        />
                                    </div>
                                    <span class="compliance-value">
                                        {stat.aboveTarget} ({getPercentage(stat.aboveTarget, stat.count).toFixed(1)}%)
                                    </span>
                                </div>
                                <div class="compliance-row">
                                    <span class="compliance-label below">Below Target</span>
                                    <div class="compliance-bar">
                                        <div
                                            class="compliance-fill below"
                                            style={{ width: `${getPercentage(stat.belowTarget, stat.count)}%` }}
                                        />
                                    </div>
                                    <span class="compliance-value">
                                        {stat.belowTarget} ({getPercentage(stat.belowTarget, stat.count).toFixed(1)}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <style>{`
                .stats-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
                    gap: var(--spacing-lg);
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

                .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
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
