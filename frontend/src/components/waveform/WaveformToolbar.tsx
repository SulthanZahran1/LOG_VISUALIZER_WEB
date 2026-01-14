import { hoverTime, zoomLevel, viewRange, viewportWidth, scrollOffset } from '../../stores/waveformStore';
import { currentSession } from '../../stores/logStore';
import { formatTimestamp } from '../../utils/TimeAxisUtils';

const ZOOM_PRESETS = [
    { label: '1s', duration: 1000 },
    { label: '10s', duration: 10000 },
    { label: '1min', duration: 60000 },
    { label: '10min', duration: 600000 },
    { label: '1hr', duration: 3600000 },
];

export function WaveformToolbar() {
    const range = viewRange.value;
    const cursorTime = hoverTime.value;
    const session = currentSession.value;
    const hasData = session && session.status === 'complete' && session.startTime !== undefined;

    const handleZoomIn = () => {
        const newZoom = zoomLevel.value * 1.3;
        if (newZoom <= 1000) {
            const center = viewportWidth.value / 2;
            const centerTime = (range?.start || 0) + center / zoomLevel.value;
            zoomLevel.value = newZoom;
            scrollOffset.value = centerTime - center / newZoom;
        }
    };

    const handleZoomOut = () => {
        const newZoom = zoomLevel.value / 1.3;
        if (newZoom >= 0.000001) {
            const center = viewportWidth.value / 2;
            const centerTime = (range?.start || 0) + center / zoomLevel.value;
            zoomLevel.value = newZoom;
            scrollOffset.value = centerTime - center / newZoom;
        }
    };

    const handleFitToWindow = () => {
        if (!session || session.startTime === undefined || session.endTime === undefined) return;
        const duration = session.endTime - session.startTime;
        if (duration <= 0) return;

        // Fit with 5% padding on each side
        const paddedDuration = duration * 1.1;
        zoomLevel.value = viewportWidth.value / paddedDuration;
        scrollOffset.value = session.startTime - duration * 0.05;
    };

    const handleGoToStart = () => {
        if (!session || session.startTime === undefined) return;
        scrollOffset.value = session.startTime;
    };

    const handleGoToEnd = () => {
        if (!session || session.endTime === undefined) return;
        const viewDuration = viewportWidth.value / zoomLevel.value;
        scrollOffset.value = session.endTime - viewDuration;
    };

    const handlePresetClick = (duration: number) => {
        zoomLevel.value = viewportWidth.value / duration;
    };

    return (
        <div class="waveform-toolbar">
            {/* Navigation Controls */}
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    onClick={handleGoToStart}
                    disabled={!hasData}
                    title="Go to Start (Home)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="11,17 6,12 11,7" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="4" y1="4" x2="4" y2="20" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={handleGoToEnd}
                    disabled={!hasData}
                    title="Go to End (End)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="13,17 18,12 13,7" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="20" y1="4" x2="20" y2="20" />
                    </svg>
                </button>
            </div>

            <div class="toolbar-separator" />

            {/* Zoom Controls */}
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    onClick={handleZoomOut}
                    title="Zoom Out (-)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={handleZoomIn}
                    title="Zoom In (+)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={handleFitToWindow}
                    disabled={!hasData}
                    title="Fit to Window"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 3v18" />
                        <path d="M15 3v18" />
                    </svg>
                </button>
            </div>

            <div class="toolbar-separator" />

            {/* Zoom Presets */}
            <div class="toolbar-group presets">
                {ZOOM_PRESETS.map(preset => (
                    <button
                        key={preset.label}
                        class="preset-btn"
                        onClick={() => handlePresetClick(preset.duration)}
                        title={`Zoom to ${preset.label} view`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            {/* Spacer */}
            <div class="toolbar-spacer" />

            {/* Cursor Readout */}
            <div class="cursor-readout">
                {cursorTime !== null ? (
                    <>
                        <span class="readout-label">Cursor:</span>
                        <span class="readout-value">{formatTimestamp(cursorTime)}</span>
                    </>
                ) : (
                    <span class="readout-hint">Hover over waveform</span>
                )}
            </div>

            <style>{`
                .waveform-toolbar {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                    flex-shrink: 0;
                    min-height: 36px;
                }

                .toolbar-group {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                }

                .toolbar-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .toolbar-btn:hover:not(:disabled) {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                    border-color: var(--primary-accent);
                }

                .toolbar-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .toolbar-separator {
                    width: 1px;
                    height: 20px;
                    background: var(--border-color);
                    margin: 0 var(--spacing-xs);
                }

                .presets {
                    gap: 4px;
                }

                .preset-btn {
                    padding: 4px 8px;
                    font-size: 11px;
                    font-weight: 500;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .preset-btn:hover:not(:disabled) {
                    background: var(--bg-hover);
                    color: var(--primary-accent);
                    border-color: var(--primary-accent);
                }

                .preset-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .toolbar-spacer {
                    flex: 1;
                }

                .cursor-readout {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: 4px 10px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    font-family: var(--font-mono);
                    font-size: 12px;
                    min-width: 160px;
                }

                .readout-label {
                    color: var(--text-muted);
                }

                .readout-value {
                    color: var(--primary-accent);
                    font-weight: 500;
                }

                .readout-hint {
                    color: var(--text-muted);
                    font-style: italic;
                    font-size: 11px;
                }
            `}</style>
        </div>
    );
}
