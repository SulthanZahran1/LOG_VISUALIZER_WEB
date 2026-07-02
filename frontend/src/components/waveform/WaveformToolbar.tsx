import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { hoverTime, zoomLevel, viewRange, viewportWidth, scrollOffset, jumpToTime, selectionRange, clearSelection, zoomToSelection } from '../../stores/waveformStore';
import { currentSession, useServerSide } from '../../stores/logStore';
import { formatTimestamp } from '../../utils/TimeAxisUtils';
import { getTimeTree } from '../../api/client';
import type { TimeTreeEntry } from '../../api/client';

const ZOOM_PRESETS = [
    { label: '1s', duration: 1000 },
    { label: '10s', duration: 10000 },
    { label: '1min', duration: 60000 },
    { label: '10min', duration: 600000 },
    { label: '1hr', duration: 3600000 },
];

type TimeTreeWithSeconds = Map<string, Map<number, Map<number, Map<number, number>>>>;

export function WaveformToolbar() {
    const range = viewRange.value;
    const cursorTime = hoverTime.value;
    const session = currentSession.value;
    const hasData = session && session.status === 'complete' && session.startTime !== undefined;

    // Jump to Time — cascading dropdowns (date → hour → minute → second)
    const [serverTree, setServerTree] = useState<TimeTreeWithSeconds | null>(null);
    const isServer = useServerSide.value;

    // Build time tree with seconds granularity from API (server-side) or entries (client-side)
    useEffect(() => {
        if (!isServer || !session) return;
        getTimeTree(session.id, {}).then(data => {
            setServerTree(buildTimeTreeWithSecondsFromApi(data));
        }).catch(err => console.error('Failed to fetch time tree:', err));
    }, [isServer, session?.id]);

    // For client-side, we don't have all entries in the toolbar, so use session start/end
    // to build a minimal tree with all hours/minutes/seconds in range
    const clientTree = useMemo<TimeTreeWithSeconds>(() => {
        if (!session || session.startTime === undefined || session.endTime === undefined) return new Map();
        return buildFullTimeTree(session.startTime, session.endTime);
    }, [session?.startTime, session?.endTime]);

    const timeTree: TimeTreeWithSeconds = isServer ? (serverTree ?? new Map<string, Map<number, Map<number, Map<number, number>>>>()) : clientTree;
    const dates = useMemo((): string[] => Array.from(timeTree.keys()).sort(), [timeTree]);

    const [selectedDate, setSelectedDate] = useState('');
    const [selectedHour, setSelectedHour] = useState('');
    const [selectedMinute, setSelectedMinute] = useState('');
    const [selectedSecond, setSelectedSecond] = useState('');

    // Refs for auto-advance between HH → MM → SS
    const hourRef = useRef<HTMLInputElement>(null);
    const minuteRef = useRef<HTMLInputElement>(null);
    const secondRef = useRef<HTMLInputElement>(null);

    // Auto-advance: when a time input reaches 2 digits, focus the next field
    const handleTimeInput = (
        value: string,
        setter: (v: string) => void,
        maxVal: number,
        nextRef: { current: HTMLInputElement | null } | undefined,
    ) => {
        // Strip non-digits
        let digits = value.replace(/\D/g, '');
        if (digits.length > 2) digits = digits.slice(0, 2);
        const num = parseInt(digits, 10);
        if (isNaN(num)) {
            setter('');
            return;
        }
        // Clamp to valid range
        if (num > maxVal) digits = String(maxVal).padStart(2, '0');
        setter(digits);
        // Auto-advance when 2 digits typed
        if (digits.length === 2 && nextRef?.current) {
            nextRef.current.focus();
            nextRef.current.select();
        }
    };

    // Reset children when parent changes
    useEffect(() => { setSelectedHour(''); setSelectedMinute(''); setSelectedSecond(''); }, [selectedDate]);
    useEffect(() => { setSelectedMinute(''); setSelectedSecond(''); }, [selectedHour]);
    useEffect(() => { setSelectedSecond(''); }, [selectedMinute]);

    const hours = useMemo((): number[] => {
        if (!selectedDate || !timeTree.has(selectedDate)) return [];
        return (Array.from(timeTree.get(selectedDate)!.keys()) as number[]).sort((a, b) => a - b);
    }, [selectedDate, timeTree]);

    const minutes = useMemo((): number[] => {
        if (!selectedDate || selectedHour === '' || !timeTree.has(selectedDate)) return [];
        const h = Number(selectedHour);
        const hourMap = timeTree.get(selectedDate)!;
        if (!hourMap.has(h)) return [];
        return (Array.from(hourMap.get(h)!.keys()) as number[]).sort((a, b) => a - b);
    }, [selectedDate, selectedHour, timeTree]);

    const seconds = useMemo((): number[] => {
        if (!selectedDate || selectedHour === '' || selectedMinute === '' || !timeTree.has(selectedDate)) return [];
        const h = Number(selectedHour);
        const m = Number(selectedMinute);
        const hourMap = timeTree.get(selectedDate)!;
        if (!hourMap.has(h)) return [];
        const minuteMap = hourMap.get(h)!;
        if (!minuteMap.has(m)) return [];
        return (Array.from(minuteMap.get(m)!.keys()) as number[]).sort((a, b) => a - b);
    }, [selectedDate, selectedHour, selectedMinute, timeTree]);

    const handleJumpToTime = () => {
        if (!selectedDate || selectedHour === '' || selectedMinute === '') return;
        const h = Number(selectedHour);
        const m = Number(selectedMinute);
        const s = selectedSecond !== '' ? Number(selectedSecond) : 0;
        const hourMap = timeTree.get(selectedDate);
        if (!hourMap) return;
        const minuteMap = hourMap.get(h);
        if (!minuteMap) return;
        const secondMap = minuteMap.get(m);
        if (!secondMap) return;
        const ts = secondMap.get(s);
        if (ts !== undefined) {
            jumpToTime(ts);
        } else {
            // No exact second match — use the first second in this minute
            const firstTs = secondMap.values().next().value;
            if (firstTs !== undefined) jumpToTime(firstTs);
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

    // Logarithmic slider helpers
    const MIN_LOG = -6; // 10^-6
    const MAX_LOG = 3;  // 10^3
    const LOG_RANGE = MAX_LOG - MIN_LOG;

    const getSliderValue = (zoom: number) => {
        const logZoom = Math.log10(zoom);
        return ((logZoom - MIN_LOG) / LOG_RANGE) * 100;
    };

    const getZoomFromSlider = (value: number) => {
        const logZoom = MIN_LOG + (value / 100) * LOG_RANGE;
        return Math.pow(10, logZoom);
    };

    const handleSliderChange = (e: Event) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        const newZoom = getZoomFromSlider(val);

        // Keep center in view
        const center = viewportWidth.value / 2;
        const centerTime = (range?.start || 0) + center / zoomLevel.value;
        zoomLevel.value = newZoom;
        scrollOffset.value = centerTime - center / newZoom;
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

            {/* Zoom Slider */}
            <div class="toolbar-group zoom-slider-group">
                <span class="slider-icon">-</span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={getSliderValue(zoomLevel.value)}
                    onInput={handleSliderChange}
                    class="zoom-slider"
                    title="Zoom Level"
                />
                <span class="slider-icon">+</span>
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

            {/* Jump to Time — cascading dropdowns */}
            <div class="jump-to-time">
                <select
                    class="jump-select"
                    value={selectedDate}
                    disabled={!hasData}
                    onChange={(e) => setSelectedDate((e.target as HTMLSelectElement).value)}
                    title="Date"
                >
                    <option value="" disabled>Date</option>
                    {dates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {/* HH — typeable input with dropdown suggestions */}
                <input
                    ref={hourRef}
                    class="jump-input jump-input-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="HH"
                    maxLength={2}
                    value={selectedHour}
                    disabled={!hasData || !selectedDate}
                    onInput={(e) => handleTimeInput(
                        (e.target as HTMLInputElement).value,
                        setSelectedHour,
                        23,
                        minuteRef,
                    )}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    title="Hour"
                    list="jump-hours"
                />
                <datalist id="jump-hours">
                    {hours.map(h => <option key={h} value={String(h).padStart(2, '0')} />)}
                </datalist>

                {/* MM — typeable input with dropdown suggestions */}
                <input
                    ref={minuteRef}
                    class="jump-input jump-input-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="MM"
                    maxLength={2}
                    value={selectedMinute}
                    disabled={!hasData || selectedHour === ''}
                    onInput={(e) => handleTimeInput(
                        (e.target as HTMLInputElement).value,
                        setSelectedMinute,
                        59,
                        secondRef,
                    )}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    title="Minute"
                    list="jump-minutes"
                />
                <datalist id="jump-minutes">
                    {minutes.map(m => <option key={m} value={String(m).padStart(2, '0')} />)}
                </datalist>

                {/* SS — typeable input with dropdown suggestions */}
                <input
                    ref={secondRef}
                    class="jump-input jump-input-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="SS"
                    maxLength={2}
                    value={selectedSecond}
                    disabled={!hasData || selectedMinute === ''}
                    onInput={(e) => handleTimeInput(
                        (e.target as HTMLInputElement).value,
                        setSelectedSecond,
                        59,
                        undefined,
                    )}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    title="Second"
                    list="jump-seconds"
                />
                <datalist id="jump-seconds">
                    {seconds.map(s => <option key={s} value={String(s).padStart(2, '0')} />)}
                </datalist>
                <button
                    class="jump-btn"
                    onClick={handleJumpToTime}
                    disabled={!hasData || !selectedDate || selectedHour === '' || selectedMinute === ''}
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

                .jump-select {
                    padding: 4px 6px;
                    font-family: var(--font-mono);
                    font-size: 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-primary);
                    outline: none;
                    transition: all var(--transition-fast);
                    cursor: pointer;
                }

                .jump-select:focus {
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 2px rgba(77, 182, 226, 0.2);
                }

                .jump-select:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .jump-select-time {
                    width: 56px;
                }

                /* Typeable time inputs (HH/MM/SS) */
                .jump-input {
                    padding: 4px 6px;
                    font-family: var(--font-mono);
                    font-size: 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-primary);
                    outline: none;
                    transition: all var(--transition-fast);
                    cursor: text;
                }

                .jump-input:focus {
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 2px rgba(77, 182, 226, 0.2);
                }

                .jump-input:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .jump-input::placeholder {
                    color: var(--text-muted);
                    opacity: 0.6;
                }

                .jump-input-time {
                    width: 40px;
                    text-align: center;
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

                .zoom-slider-group {
                    gap: 8px;
                    padding: 0 4px;
                }

                .zoom-slider {
                    width: 120px;
                    height: 4px;
                    -webkit-appearance: none;
                    background: var(--border-color);
                    border-radius: 2px;
                    outline: none;
                    cursor: pointer;
                }

                .zoom-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 12px;
                    height: 12px;
                    background: var(--primary-accent);
                    border-radius: 50%;
                    cursor: pointer;
                    transition: transform var(--transition-fast);
                }

                .zoom-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                }

                .slider-icon {
                    font-size: 14px;
                    color: var(--text-muted);
                    font-weight: 600;
                    user-select: none;
                }
            `}</style>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Time tree builders with seconds granularity
// ──────────────────────────────────────────────────────────────

/**
 * Build time tree from API response (server-side path).
 * The API returns date/hour/minute/second/ts.
 */
function buildTimeTreeWithSecondsFromApi(entries: TimeTreeEntry[]): TimeTreeWithSeconds {
    const tree: TimeTreeWithSeconds = new Map();
    for (const e of entries) {
        if (!tree.has(e.date)) tree.set(e.date, new Map());
        const hours = tree.get(e.date)!;
        if (!hours.has(e.hour)) hours.set(e.hour, new Map());
        const minutes = hours.get(e.hour)!;
        if (!minutes.has(e.minute)) minutes.set(e.minute, new Map());
        const seconds = minutes.get(e.minute)!;
        if (!seconds.has(e.second)) seconds.set(e.second, e.ts);
    }
    return tree;
}

/**
 * Build a full time tree from session start/end time.
 * Generates all hours, minutes, and seconds in the range so the user
 * can pick any time, not just times with entries (for client-side mode
 * where we don't have all entries loaded).
 */
function buildFullTimeTree(startMs: number, endMs: number): TimeTreeWithSeconds {
    const tree: TimeTreeWithSeconds = new Map();
    const start = new Date(startMs);
    const end = new Date(endMs);

    // Walk through each second from start to end (capped to prevent huge trees)
    const totalSeconds = Math.floor((endMs - startMs) / 1000);
    const MAX_SECONDS = 86400 * 7; // Cap at 7 days worth of seconds

    if (totalSeconds > MAX_SECONDS) {
        // For very large ranges, only build hour/minute granularity (no seconds)
        const startD = new Date(startMs);
        const endD = new Date(endMs);
        let current = new Date(startD);
        current.setUTCSeconds(0, 0);

        while (current <= endD) {
            const dateStr = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
            const hour = current.getUTCHours();
            const minute = current.getUTCMinutes();
            const sec = 0; // Default second
            const ts = current.getTime();

            if (!tree.has(dateStr)) tree.set(dateStr, new Map());
            const hours = tree.get(dateStr)!;
            if (!hours.has(hour)) hours.set(hour, new Map());
            const minutes = hours.get(hour)!;
            if (!minutes.has(minute)) minutes.set(minute, new Map());
            const seconds = minutes.get(minute)!;
            if (!seconds.has(sec)) seconds.set(sec, ts);

            current = new Date(current.getTime() + 60000); // +1 minute
        }
        return tree;
    }

    let current = new Date(start);
    current.setUTCMilliseconds(0);

    while (current <= end) {
        const dateStr = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
        const hour = current.getUTCHours();
        const minute = current.getUTCMinutes();
        const sec = current.getUTCSeconds();
        const ts = current.getTime();

        if (!tree.has(dateStr)) tree.set(dateStr, new Map());
        const hours = tree.get(dateStr)!;
        if (!hours.has(hour)) hours.set(hour, new Map());
        const minutes = hours.get(hour)!;
        if (!minutes.has(minute)) minutes.set(minute, new Map());
        const seconds = minutes.get(minute)!;
        if (!seconds.has(sec)) seconds.set(sec, ts);

        current = new Date(current.getTime() + 1000); // +1 second
    }
    return tree;
}
