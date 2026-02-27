/**
 * TransitionHistogram - Histogram visualization of duration distribution
 */
import { useMemo } from 'preact/hooks';
import { transitionConfig, transitionResults } from '../../stores/transitionStore';

export function TransitionHistogram() {
    const config = transitionConfig.value;
    const results = transitionResults.value;

    // Calculate histogram data
    const histogramData = useMemo(() => {
        if (results.length === 0) return { bins: [], maxCount: 0, binWidth: 0, minValue: 0, count: 0 };

        const durations = results.map(r => r.duration);
        const minValue = Math.min(...durations);
        const maxValue = Math.max(...durations);
        const range = maxValue - minValue;

        // Use Sturges' rule for bin count, minimum 5 bins
        const binCount = Math.max(5, Math.ceil(1 + 3.322 * Math.log10(durations.length)));
        const binWidth = range / binCount || 1;

        // Create bins
        const bins: { start: number; end: number; count: number }[] = [];
        for (let i = 0; i < binCount; i++) {
            bins.push({
                start: minValue + i * binWidth,
                end: minValue + (i + 1) * binWidth,
                count: 0
            });
        }

        // Fill bins
        for (const duration of durations) {
            let binIndex = Math.floor((duration - minValue) / binWidth);
            if (binIndex >= binCount) binIndex = binCount - 1;
            if (binIndex < 0) binIndex = 0;
            bins[binIndex].count++;
        }

        const maxCount = Math.max(...bins.map(b => b.count));

        return { bins, maxCount, binWidth, minValue, count: results.length };
    }, [results]);

    const formatDuration = (ms: number) => {
        if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
        return `${ms.toFixed(0)}ms`;
    };

    if (!config) {
        return (
            <div class="histogram-empty">
                <p>No transition configuration found.</p>
            </div>
        );
    }

    if (histogramData.count === 0) {
        return (
            <div class="histogram-empty">
                <p>No data for the current configuration.</p>
            </div>
        );
    }

    return (
        <div class="histogram-container">
            <div class="histogram-header">
                <h3>Duration Distribution: {config.name}</h3>
            </div>

            <div class="histogram-chart">
                <div class="y-axis">
                    <span>{histogramData.maxCount}</span>
                    <span>{Math.round(histogramData.maxCount / 2)}</span>
                    <span>0</span>
                </div>
                <div class="chart-area">
                    {histogramData.bins.map((bin, index) => {
                        const height = histogramData.maxCount > 0
                            ? (bin.count / histogramData.maxCount) * 100
                            : 0;

                        // Check if this bin contains the target
                        const targetMs = config.targetDuration;
                        const isTargetBin = targetMs && bin.start <= targetMs && bin.end >= targetMs;

                        return (
                            <div key={index} class="bar-container" title={`${bin.count} transitions`}>
                                <div
                                    class={`bar ${isTargetBin ? 'target' : ''}`}
                                    style={{ height: `${height}%` }}
                                >
                                    {bin.count > 0 && <span class="bar-label">{bin.count}</span>}
                                </div>
                                <span class="x-label">{formatDuration(bin.start)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {config.targetDuration && (
                <div class="histogram-legend">
                    <span class="legend-item">
                        <span class="legend-marker target"></span>
                        Target: {formatDuration(config.targetDuration)}
                        {config.tolerance && ` ±${formatDuration(config.tolerance)}`}
                    </span>
                </div>
            )}

            <style>{`
                .histogram-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    max-height: 500px;
                }

                .histogram-empty {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    color: var(--text-muted);
                }

                .histogram-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: var(--spacing-lg);
                }

                .histogram-header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .histogram-chart {
                    display: flex;
                    flex: 1;
                    min-height: 200px;
                }

                .y-axis {
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    padding-right: var(--spacing-sm);
                    font-size: 10px;
                    color: var(--text-muted);
                    text-align: right;
                    width: 40px;
                }

                .chart-area {
                    flex: 1;
                    display: flex;
                    align-items: flex-end;
                    gap: 2px;
                    padding-bottom: 24px;
                    border-left: 1px solid var(--border-color);
                    border-bottom: 1px solid var(--border-color);
                    position: relative;
                }

                .bar-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                    position: relative;
                }

                .bar {
                    width: 100%;
                    max-width: 40px;
                    background: var(--primary-accent);
                    border-radius: 2px 2px 0 0;
                    position: relative;
                    transition: height 0.3s ease;
                    margin-top: auto;
                }

                .bar.target {
                    background: #34A853;
                }

                .bar:hover {
                    filter: brightness(1.2);
                }

                .bar-label {
                    position: absolute;
                    top: -18px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 10px;
                    color: var(--text-secondary);
                }

                .x-label {
                    position: absolute;
                    bottom: -20px;
                    font-size: 9px;
                    color: var(--text-muted);
                    white-space: nowrap;
                    transform: rotate(-45deg);
                    transform-origin: top left;
                }

                .histogram-legend {
                    display: flex;
                    justify-content: center;
                    margin-top: var(--spacing-lg);
                }

                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--text-secondary);
                }

                .legend-marker {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                }

                .legend-marker.target {
                    background: #34A853;
                }
            `}</style>
        </div>
    );
}
