/**
 * TransitionTrend - Time series trend chart with aggregation options
 */
import { useMemo } from 'preact/hooks';
import {
    transitionRules,
    selectedRuleId,
    trendSettings,
    getAggregatedTrendData,
    type AggregationType,
    type TrendDisplayMode
} from '../../stores/transitionStore';

export function TransitionTrend() {
    const rules = transitionRules.value;
    const settings = trendSettings.value;
    const selectedId = selectedRuleId.value;

    // Get the rule to display (selected or first)
    const displayRuleId = selectedId || (rules.length > 0 ? rules[0].id : null);
    const displayRule = rules.find(r => r.id === displayRuleId);

    const trendData = useMemo(() => {
        if (!displayRuleId) return [];
        return getAggregatedTrendData(displayRuleId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayRuleId]);

    const chartMetrics = useMemo(() => {
        if (trendData.length === 0) return { minY: 0, maxY: 100, minX: 0, maxX: 1, rangeY: 100 };

        const values = trendData.map(d => d.value);
        const times = trendData.map(d => d.time);

        const minY = Math.min(...values);
        const maxY = Math.max(...values);
        const minX = Math.min(...times);
        const maxX = Math.max(...times);

        // Add some padding to Y range
        const rangeY = maxY - minY || 1;
        const paddedMinY = minY - rangeY * 0.1;
        const paddedMaxY = maxY + rangeY * 0.1;

        return {
            minY: paddedMinY,
            maxY: paddedMaxY,
            minX,
            maxX,
            rangeY: paddedMaxY - paddedMinY
        };
    }, [trendData]);

    const formatDuration = (ms: number) => {
        if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
        return `${ms.toFixed(0)}ms`;
    };

    const formatTime = (ms: number) => {
        const date = new Date(ms);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const updateSettings = (updates: Partial<typeof settings>) => {
        trendSettings.value = { ...settings, ...updates };
    };

    if (rules.length === 0) {
        return (
            <div class="trend-empty">
                <p>No rules defined. Create a rule to see the trend chart.</p>
            </div>
        );
    }

    if (trendData.length === 0) {
        return (
            <div class="trend-empty">
                <p>No data for the selected rule.</p>
            </div>
        );
    }

    // Calculate SVG path for line chart
    const chartWidth = 800;
    const chartHeight = 300;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    const scaleX = (time: number) => {
        const range = chartMetrics.maxX - chartMetrics.minX || 1;
        return padding.left + ((time - chartMetrics.minX) / range) * plotWidth;
    };

    const scaleY = (value: number) => {
        return padding.top + plotHeight - ((value - chartMetrics.minY) / chartMetrics.rangeY) * plotHeight;
    };

    const linePath = trendData.map((d, i) => {
        const x = scaleX(d.time);
        const y = scaleY(d.value);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

    const targetY = displayRule?.targetDuration ? scaleY(displayRule.targetDuration) : null;

    return (
        <div class="trend-container">
            <div class="trend-header">
                <div class="trend-title">
                    <h3>Trend: {displayRule?.name}</h3>
                    {rules.length > 1 && (
                        <select
                            value={displayRuleId || ''}
                            onChange={(e) => selectedRuleId.value = (e.target as HTMLSelectElement).value}
                        >
                            {rules.map(rule => (
                                <option key={rule.id} value={rule.id}>{rule.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div class="trend-controls">
                    <div class="control-group">
                        <label>Aggregation:</label>
                        <select
                            value={settings.aggregationType}
                            onChange={(e) => updateSettings({ aggregationType: (e.target as HTMLSelectElement).value as AggregationType })}
                        >
                            <option value="none">None</option>
                            <option value="moving-average">Moving Average</option>
                            <option value="time-bucket">Time Buckets</option>
                        </select>
                    </div>

                    {settings.aggregationType === 'moving-average' && (
                        <div class="control-group">
                            <label>Window:</label>
                            <input
                                type="number"
                                min="2"
                                max="100"
                                value={settings.movingAverageWindow}
                                onChange={(e) => updateSettings({ movingAverageWindow: parseInt((e.target as HTMLInputElement).value) || 10 })}
                            />
                        </div>
                    )}

                    {settings.aggregationType === 'time-bucket' && (
                        <div class="control-group">
                            <label>Bucket:</label>
                            <select
                                value={settings.timeBucketMinutes}
                                onChange={(e) => updateSettings({ timeBucketMinutes: parseInt((e.target as HTMLSelectElement).value) })}
                            >
                                <option value="1">1 min</option>
                                <option value="5">5 min</option>
                                <option value="15">15 min</option>
                                <option value="60">1 hour</option>
                            </select>
                        </div>
                    )}

                    <div class="control-group">
                        <label>Display:</label>
                        <select
                            value={settings.displayMode}
                            onChange={(e) => updateSettings({ displayMode: (e.target as HTMLSelectElement).value as TrendDisplayMode })}
                        >
                            <option value="line">Line</option>
                            <option value="points">Points</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="trend-chart">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                        const y = padding.top + ratio * plotHeight;
                        const value = chartMetrics.maxY - ratio * chartMetrics.rangeY;
                        return (
                            <g key={ratio}>
                                <line
                                    x1={padding.left}
                                    y1={y}
                                    x2={chartWidth - padding.right}
                                    y2={y}
                                    stroke="var(--border-color)"
                                    strokeDasharray="4"
                                />
                                <text
                                    x={padding.left - 8}
                                    y={y + 4}
                                    textAnchor="end"
                                    fontSize="10"
                                    fill="var(--text-muted)"
                                >
                                    {formatDuration(value)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Target line */}
                    {targetY !== null && targetY >= padding.top && targetY <= chartHeight - padding.bottom && (
                        <g>
                            <line
                                x1={padding.left}
                                y1={targetY}
                                x2={chartWidth - padding.right}
                                y2={targetY}
                                stroke="#34A853"
                                strokeWidth="2"
                                strokeDasharray="8,4"
                            />
                            <text
                                x={chartWidth - padding.right + 4}
                                y={targetY + 4}
                                fontSize="10"
                                fill="#34A853"
                            >
                                Target
                            </text>
                        </g>
                    )}

                    {/* Data visualization */}
                    {settings.displayMode === 'line' && (
                        <path
                            d={linePath}
                            fill="none"
                            stroke="var(--primary-accent)"
                            strokeWidth="2"
                        />
                    )}

                    {(settings.displayMode === 'points' || trendData.length <= 50) && (
                        trendData.map((d, i) => (
                            <circle
                                key={i}
                                cx={scaleX(d.time)}
                                cy={scaleY(d.value)}
                                r={settings.displayMode === 'points' ? 4 : 3}
                                fill="var(--primary-accent)"
                            >
                                <title>{`${formatTime(d.time)}: ${formatDuration(d.value)}`}</title>
                            </circle>
                        ))
                    )}

                    {/* X axis labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                        const x = padding.left + ratio * plotWidth;
                        const time = chartMetrics.minX + ratio * (chartMetrics.maxX - chartMetrics.minX);
                        return (
                            <text
                                key={ratio}
                                x={x}
                                y={chartHeight - padding.bottom + 20}
                                textAnchor="middle"
                                fontSize="10"
                                fill="var(--text-muted)"
                            >
                                {formatTime(time)}
                            </text>
                        );
                    })}
                </svg>
            </div>

            <div class="trend-info">
                <span>{trendData.length} data points</span>
                {settings.aggregationType !== 'none' && (
                    <span class="aggregation-info">
                        ({settings.aggregationType === 'moving-average'
                            ? `${settings.movingAverageWindow}-point moving average`
                            : `${settings.timeBucketMinutes}min buckets`})
                    </span>
                )}
            </div>

            <style>{`
                .trend-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }

                .trend-empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    color: var(--text-muted);
                }

                .trend-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    margin-bottom: var(--spacing-md);
                    flex-wrap: wrap;
                    gap: var(--spacing-md);
                }

                .trend-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .trend-title h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .trend-title select,
                .trend-controls select,
                .trend-controls input {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 4px 8px;
                    color: var(--text-primary);
                    font-size: 11px;
                }

                .trend-controls {
                    display: flex;
                    gap: var(--spacing-md);
                    flex-wrap: wrap;
                }

                .control-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .control-group label {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .control-group input[type="number"] {
                    width: 60px;
                }

                .trend-chart {
                    flex: 1;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: var(--spacing-md);
                    min-height: 300px;
                }

                .trend-chart svg {
                    width: 100%;
                    height: 100%;
                }

                .trend-info {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-sm);
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .aggregation-info {
                    color: var(--primary-accent);
                }
            `}</style>
        </div>
    );
}
