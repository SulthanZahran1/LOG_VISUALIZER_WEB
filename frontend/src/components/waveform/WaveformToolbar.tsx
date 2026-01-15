import { useState } from 'preact/hooks';
import { hoverTime, zoomLevel, viewRange, viewportWidth, scrollOffset, jumpToTime, selectionRange, clearSelection, zoomToSelection } from '../../stores/waveformStore';
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

    // Jump to Time state
    const [jumpInput, setJumpInput] = useState('');
    const [jumpError, setJumpError] = useState(false);

    /**
     * Parse time string in format HH:MM:SS or HH:MM:SS.mmm to milliseconds
     * Returns null if invalid
     */
    const parseTimeInput = (input: string): number | null => {
        if (!session || session.startTime === undefined) return null;

        // Match HH:MM:SS or HH:MM:SS.mmm
        const match = input.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!match) return null;

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        const millis = match[4] ? parseInt(match[4].padEnd(3, '0'), 10) : 0;

        if (hours > 23 || minutes > 59 || seconds > 59) return null;

        // Get the date from session startTime and construct target time
        const baseDate = new Date(session.startTime);
        const targetDate = new Date(baseDate);
        targetDate.setUTCHours(hours, minutes, seconds, millis);

        return targetDate.getTime();
    };

    const handleJumpToTime = () => {
        const time = parseTimeInput(jumpInput);
        if (time !== null) {
            jumpToTime(time);
            setJumpError(false);
            setJumpInput('');
        } else {
            setJumpError(true);
        }
    };

    const handleJumpInputKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleJumpToTime();
        }
    };

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

    const handleJump = (direction: 'forward' | 'backward', size: 'large' | 'small') => {
        if (!session || session.startTime === undefined || session.endTime === undefined) return;

        const viewDuration = viewportWidth.value / zoomLevel.value;
        const jumpSize = size === 'large' ? viewDuration * 0.1 : Math.max(viewDuration * 0.01, 1000); // 10% or 1% (min 1s)

        const delta = direction === 'forward' ? jumpSize : -jumpSize;
        const newOffset = scrollOffset.value + delta;

        // Clamp
        const maxOffset = session.endTime - viewDuration;
        scrollOffset.value = Math.max(session.startTime, Math.min(newOffset, maxOffset));
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

            {/* Jump Controls */}
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    onClick={() => handleJump('backward', 'large')}
                    disabled={!hasData}
                    title="Jump Back 10% (<<)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="11,17 6,12 11,7" />
                        <polyline points="18,17 13,12 18,7" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={() => handleJump('backward', 'small')}
                    disabled={!hasData}
                    title="Jump Back 1% (<)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15,18 9,12 15,6" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={() => handleJump('forward', 'small')}
                    disabled={!hasData}
                    title="Jump Forward 1% (>)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9,18 15,12 9,6" />
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    onClick={() => handleJump('forward', 'large')}
                    disabled={!hasData}
                    title="Jump Forward 10% (>>)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="13,17 18,12 13,7" />
                        <polyline points="6,17 11,12 6,7" />
                    </svg>
                </button>
            </div>

            <div class="toolbar-separator" />

            {/* Selection Controls */}
            {selectionRange.value && (
                <>
                    <div class="toolbar-group">
                        <div class="selection-indicator">
                            <span class="selection-label">Selection:</span>
                            <span class="selection-value">
                                {((Math.abs(selectionRange.value.end - selectionRange.value.start)) / 1000).toFixed(3)}s
                            </span>
                        </div>
                        <button
                            class="toolbar-btn primary"
                            onClick={zoomToSelection}
                            title="Zoom to Selection"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <path d="M8 11h6" />
                            </svg>
                        </button>
                        <button
                            class="toolbar-btn danger"
                            onClick={clearSelection}
                            title="Clear Selection"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <div class="toolbar-separator" />
                </>
            )}

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

            {/* Jump to Time Input */}
            <div class="jump-to-time">
                <input
                    type="text"
                    class={`jump-input ${jumpError ? 'error' : ''}`}
                    placeholder="HH:MM:SS"
                    value={jumpInput}
                    onInput={(e) => {
                        setJumpInput((e.target as HTMLInputElement).value);
                        setJumpError(false);
                    }}
                    onKeyDown={handleJumpInputKeyDown}
                    disabled={!hasData}
                />
                <button
                    class="jump-btn"
                    onClick={handleJumpToTime}
                    disabled={!hasData || !jumpInput}
                    title="Jump to Time"
                >
                    Go
                </button>
            </div>

            <div class="toolbar-separator" />

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

                .selection-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-primary);
                }

                .selection-label {
                    font-size: 11px;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .selection-value {
                    font-family: var(--font-mono);
                    font-size: 12px;
                    color: var(--primary-accent);
                    background: rgba(77, 182, 226, 0.1);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .nav-btn.accent {
                    color: var(--primary-accent);
                }

                .nav-btn.accent:hover {
                    background: rgba(77, 182, 226, 0.15);
                }

                .nav-btn.error {
                    color: var(--accent-error);
                }

                .nav-btn.error:hover {
                    background: rgba(248, 81, 73, 0.15);
                }

                .jump-to-time {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .selection-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 4px;
                }

                .selection-label {
                    font-size: 11px;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                }

                .selection-value {
                    font-family: var(--font-mono);
                    font-size: 11px;
                    color: var(--primary-accent);
                    background: rgba(77, 182, 226, 0.1);
                    padding: 2px 6px;
                    border-radius: 4px;
                    min-width: 60px;
                    text-align: center;
                }

                .toolbar-btn.primary {
                    color: var(--primary-accent);
                }

                .toolbar-btn.primary:hover {
                    background: rgba(77, 182, 226, 0.1);
                    border-color: var(--primary-accent);
                }

                .toolbar-btn.danger {
                    color: var(--accent-error);
                }

                .toolbar-btn.danger:hover {
                    background: rgba(248, 81, 73, 0.1);
                    border-color: var(--accent-error);
                }

                .jump-input {
                    width: 90px;
                    padding: 4px 8px;
                    font-family: var(--font-mono);
                    font-size: 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-primary);
                    outline: none;
                    transition: all var(--transition-fast);
                }

                .jump-input:focus {
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 2px rgba(77, 182, 226, 0.2);
                }

                .jump-input.error {
                    border-color: var(--accent-error);
                    box-shadow: 0 0 0 2px rgba(248, 81, 73, 0.2);
                }

                .jump-input::placeholder {
                    color: var(--text-muted);
                }

                .jump-input:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .jump-btn {
                    padding: 4px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    background: var(--primary-accent);
                    border: none;
                    border-radius: var(--border-radius);
                    color: white;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .jump-btn:hover:not(:disabled) {
                    background: #5fc4e8;
                }

                .jump-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
