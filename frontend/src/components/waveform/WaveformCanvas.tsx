import { useEffect, useRef, useState } from 'preact/hooks';
import {
    viewRange,
    waveformEntries,
    waveformBoundaries,
    selectedSignals,
    viewportWidth,
    zoomAt,
    pan,
    zoomLevel,
    hoverTime,
    jumpToTime,
    selectionRange,
    focusedSignal,
    deviceColors,
    isWaveformLoading,
    waveformLoadingProgress,
    hoverX,
    hoverRow,
    cancelWaveformLoading
} from '../../stores/waveformStore';
import { sortedBookmarks, type Bookmark } from '../../stores/bookmarkStore';
import type { LogEntry } from '../../models/types';
import { formatTimestamp, getTickIntervals, findFirstIndexAtTime } from '../../utils/TimeAxisUtils';
import { parseSECSValue } from '../../utils/secsLog';
import { SECSMessageDialog } from '../secs/SECSMessageDialog';

const ROW_HEIGHT = 60;
const SIGNAL_LABEL_GUTTER_WIDTH = 170;
const SIGNAL_LABEL_PADDING_X = 10;
const MIN_PLOT_WIDTH = 40;

/**
 * Safely get timestamp as a number (Unix ms).
 * Handles both string (ISO/RFC3339) and number inputs.
 */
function getTimestampMs(entry: LogEntry): number {
    const ts = entry.timestamp;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') return new Date(ts).getTime();
    return 0;
}
const AXIS_HEIGHT = 32;

// Dark theme colors
const COLORS = {
    // Canvas backgrounds
    canvasBg: '#0d1117',
    axisBg: '#161b22',
    rowEven: 'rgba(33, 38, 45, 0.5)',
    rowOdd: 'transparent',

    // Grid and axis
    axisText: '#8b949e',
    axisTextBold: '#e6edf3',
    gridMajor: 'rgba(48, 54, 61, 0.8)',
    gridMinor: 'rgba(48, 54, 61, 0.4)',
    signalLabelHeaderBg: 'rgba(9, 12, 16, 0.98)',
    signalLabelRowBg: 'rgba(9, 12, 16, 0.9)',
    signalLabelRowFocusedBg: 'rgba(77, 182, 226, 0.2)',
    signalLabelHeaderText: '#e6edf3',
    signalLabelSignalText: '#e6edf3',
    signalLabelDeviceText: '#8b949e',
    signalLabelDivider: 'rgba(48, 54, 61, 0.95)',

    // Signal colors
    booleanHigh: '#3fb950',       // Green for HIGH
    booleanLow: '#21262d',        // Dark for LOW fill
    booleanLine: '#58d68d',       // Bright green line
    booleanFill: 'rgba(63, 185, 80, 0.2)',

    transition: '#f0883e',        // Orange for transitions

    // State signal colors - expanded palette for value-based coloring
    stateColors: [
        'rgba(88, 166, 255, 0.35)',   // Blue
        'rgba(163, 113, 247, 0.35)',  // Purple
        'rgba(210, 168, 34, 0.35)',   // Gold
        'rgba(240, 136, 62, 0.35)',   // Orange
        'rgba(63, 185, 80, 0.35)',    // Green
        'rgba(230, 100, 120, 0.35)',  // Pink
        'rgba(100, 200, 180, 0.35)',  // Teal
        'rgba(180, 140, 200, 0.35)',  // Lavender
    ],
    stateText: '#e6edf3',
    stateBorder: 'rgba(139, 148, 158, 0.3)',

    // Selection colors
    selectionBg: 'rgba(77, 182, 226, 0.25)',
    selectionBorder: '#4db6e2',
    selectionLabelBg: 'rgba(13, 17, 23, 0.8)',

    // Bookmark colors
    bookmarkLine: '#f0883e',
    bookmarkFlag: 'rgba(240, 136, 62, 0.9)',
    bookmarkText: '#ffffff',
};

function getPlotLayout(totalWidth: number) {
    // Keep a minimum waveform area on narrow screens by shrinking the gutter first.
    const gutterWidth = Math.min(SIGNAL_LABEL_GUTTER_WIDTH, Math.max(0, totalWidth - MIN_PLOT_WIDTH));
    const plotStartX = gutterWidth;
    const plotWidth = Math.max(1, totalWidth - plotStartX);

    return { gutterWidth, plotStartX, plotWidth };
}

export function WaveformCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Panning state refs
    const isPanningRef = useRef(false);
    const panStartXRef = useRef(0);
    const totalDragStartXRef = useRef(0);

    // Selection state refs
    const isSelectingRef = useRef(false);
    const selectionStartXRef = useRef(0);
    const selectionStartTimeRef = useRef(0);

    // Scroll position for virtualization
    const scrollTopRef = useRef(0);
    const containerHeightRef = useRef(0);

    // SECS message dialog state
    const [secsDialogEntry, setSecsDialogEntry] = useState<LogEntry | null>(null);

    // Resize Observer to update viewportWidth
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                viewportWidth.value = entry.contentRect.width;
                containerHeightRef.current = entry.contentRect.height;
            }
        });

        observer.observe(container);

        // Track scroll position
        const handleScroll = () => {
            scrollTopRef.current = container.scrollTop;
        };
        container.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            observer.disconnect();
            container.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // Use a reactive render approach instead of continuous requestAnimationFrame
    // This only re-renders when the signals actually change
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = viewportWidth.value;
        const height = selectedSignals.value.length * ROW_HEIGHT + AXIS_HEIGHT;

        // Set canvas size
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // Clear with dark background
        ctx.fillStyle = COLORS.canvasBg;
        ctx.fillRect(0, 0, width, height);

        const range = viewRange.value;
        if (!range) return;

        const { gutterWidth, plotStartX, plotWidth } = getPlotLayout(width);
        const rangeDuration = Math.max(1, range.end - range.start);
        const pixelsPerMs = plotWidth / rangeDuration;

        // Calculate visible row range for virtualization
        const scrollTop = scrollTopRef.current;
        const viewportHeight = containerHeightRef.current || height;
        const firstVisibleRow = Math.max(0, Math.floor((scrollTop - AXIS_HEIGHT) / ROW_HEIGHT));
        const lastVisibleRow = Math.min(
            selectedSignals.value.length - 1,
            Math.ceil((scrollTop + viewportHeight - AXIS_HEIGHT) / ROW_HEIGHT)
        );

        // Draw row backgrounds (only for visible rows + small buffer)
        const rowBuffer = 2;
        const drawStart = Math.max(0, firstVisibleRow - rowBuffer);
        const drawEnd = Math.min(selectedSignals.value.length - 1, lastVisibleRow + rowBuffer);

        for (let i = drawStart; i <= drawEnd; i++) {
            const key = selectedSignals.value[i];
            const y = AXIS_HEIGHT + (i * ROW_HEIGHT);
            const isFocused = focusedSignal.value === key;

            if (isFocused) {
                ctx.fillStyle = 'rgba(77, 182, 226, 0.15)';
            } else {
                ctx.fillStyle = i % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
            }
            ctx.fillRect(0, y, width, ROW_HEIGHT);

            // Device accent bar on the left
            const [device] = key.split('::');
            const deviceColor = deviceColors.value.get(device);
            if (deviceColor) {
                ctx.fillStyle = deviceColor;
                ctx.fillRect(0, y + 4, 4, ROW_HEIGHT - 8);
            }

            // Row separator
            ctx.strokeStyle = COLORS.gridMinor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + ROW_HEIGHT);
            ctx.lineTo(width, y + ROW_HEIGHT);
            ctx.stroke();
        }

        // Draw Time Axis
        drawTimeAxis(ctx, range.start, range.end, pixelsPerMs, plotStartX, plotWidth, width, height);

        // Get boundary values for edge rendering
        const boundaries = waveformBoundaries.value;

        // Draw Signals (only visible rows for performance)
        for (let rowIndex = drawStart; rowIndex <= drawEnd; rowIndex++) {
            const key = selectedSignals.value[rowIndex];
            const allEntries = waveformEntries.value[key] || [];
            const yBase = AXIS_HEIGHT + (rowIndex * ROW_HEIGHT);
            const yPadding = 8;
            const plotHeight = ROW_HEIGHT - (yPadding * 2);

            // Visible Window Slicing - use binary search for efficiency
            const startIdx = Math.max(0, findFirstIndexAtTime(allEntries, range.start) - 1);
            const endIdx = findFirstIndexAtTime(allEntries, range.end);
            const visibleEntries = allEntries.slice(startIdx, endIdx + 1);

            // Get boundary values for this signal (if available)
            const beforeBoundary = boundaries.before[key];

            ctx.save();
            ctx.translate(plotStartX, yBase + yPadding);

            if (visibleEntries.length > 0) {
                const firstEntry = visibleEntries[0];
                if (key.startsWith('SECS::')) {
                    drawSECSSignal(ctx, visibleEntries, range.start, pixelsPerMs, plotHeight, plotWidth, beforeBoundary);
                } else if (firstEntry.signalType === 'boolean' || typeof firstEntry.value === 'boolean') {
                    drawBooleanSignal(ctx, visibleEntries, range.start, pixelsPerMs, plotHeight, plotWidth, beforeBoundary);
                } else {
                    drawStateSignal(ctx, visibleEntries, range.start, pixelsPerMs, plotHeight, plotWidth, rowIndex, beforeBoundary);
                }
            } else if (beforeBoundary) {
                // No visible entries but we have a boundary - draw the continuous state
                const firstEntry = beforeBoundary;
                if (firstEntry.signalType === 'boolean' || typeof firstEntry.value === 'boolean') {
                    drawBooleanSignal(ctx, [beforeBoundary], range.start, pixelsPerMs, plotHeight, plotWidth, beforeBoundary);
                } else {
                    drawStateSignal(ctx, [beforeBoundary], range.start, pixelsPerMs, plotHeight, plotWidth, rowIndex, beforeBoundary);
                }
            }

            ctx.restore();
        }

        // Draw selection
        const selection = selectionRange.value;
        if (selection) {
            drawSelection(ctx, selection, range.start, pixelsPerMs, height, plotStartX, plotWidth);
        }

        // Draw cursor line if hovering
        const currentHoverX = hoverX.value;
        if (currentHoverX !== null && currentHoverX >= plotStartX && currentHoverX <= plotStartX + plotWidth) {
            ctx.strokeStyle = 'rgba(77, 182, 226, 0.8)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(currentHoverX, AXIS_HEIGHT);
            ctx.lineTo(currentHoverX, height);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw bookmark markers
        drawBookmarks(ctx, sortedBookmarks.value, range.start, pixelsPerMs, height, plotStartX, plotWidth);

        // Draw signal labels in left gutter so each row is identifiable in-canvas
        drawSignalLabels(ctx, selectedSignals.value, drawStart, drawEnd, gutterWidth);

        // Draw hover tooltip (skip for MCS rows — values are too long and ruin the UI)
        const hoverRowValue = hoverRow.value;
        if (currentHoverX !== null && hoverRowValue !== null && hoverRowValue >= 0 && hoverRowValue < selectedSignals.value.length) {
            const signalKey = selectedSignals.value[hoverRowValue];
            // Skip tooltip for MCS signals (action/command values are too long)
            if (!signalKey.startsWith('MCS') && !signalKey.startsWith('mcs')) {
                const entries = waveformEntries.value[signalKey] || [];
                const hTime = hoverTime.value;
                if (hTime !== null && entries.length > 0) {
                    let valueAtTime: boolean | string | number = entries[0].value;
                    for (const e of entries) {
                        if (getTimestampMs(e) <= hTime) valueAtTime = e.value;
                        else break;
                    }
                    drawTooltip(ctx, currentHoverX, AXIS_HEIGHT + hoverRowValue * ROW_HEIGHT, signalKey, valueAtTime, width);
                }
            }
        }
        // Dependencies: all the signals that should trigger a re-render
    }, [viewportWidth.value, selectedSignals.value, selectedSignals.value.length, viewRange.value?.start, viewRange.value?.end,
    zoomLevel.value, waveformEntries.value, selectionRange.value, hoverX.value, hoverRow.value,
    hoverTime.value, focusedSignal.value, deviceColors.value, sortedBookmarks.value]);

    const handleWheel = (e: WheelEvent) => {
        const totalWidth = viewportWidth.value;
        const { plotStartX, plotWidth } = getPlotLayout(totalWidth);

        if (e.ctrlKey) {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;

            // Ignore wheel-zoom gestures over the label gutter.
            if (x < plotStartX || x > plotStartX + plotWidth) {
                return;
            }

            const plotX = x - plotStartX;
            const zoomAnchorX = (plotX * totalWidth) / plotWidth;
            zoomAt(e.deltaY, zoomAnchorX);
        } else {
            if (e.deltaX !== 0) {
                e.preventDefault();

                // Keep pan speed consistent with the effective plot width.
                const scaledDeltaX = e.deltaX * (totalWidth / plotWidth);
                pan(-scaledDeltaX);
            }
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const totalWidth = viewportWidth.value;
        const { plotStartX, plotWidth } = getPlotLayout(totalWidth);
        const inPlot = x >= plotStartX && x <= plotStartX + plotWidth;

        if (!inPlot) {
            if (!e.shiftKey && e.button === 0) {
                selectionRange.value = null;
            }
            return;
        }

        if (e.shiftKey && e.button === 0) {
            // Start selection
            isSelectingRef.current = true;
            selectionStartXRef.current = x;

            const range = viewRange.value;
            if (range) {
                const rangeDuration = Math.max(1, range.end - range.start);
                const plotX = Math.max(0, Math.min(plotWidth, x - plotStartX));
                const startTime = range.start + ((plotX / plotWidth) * rangeDuration);
                selectionStartTimeRef.current = startTime;
                selectionRange.value = { start: startTime, end: startTime };
            }

            if (containerRef.current) {
                containerRef.current.style.cursor = 'crosshair';
            }
        } else if (e.button === 0) {
            // Start panning on left-click (button 0)
            isPanningRef.current = true;
            panStartXRef.current = e.clientX;
            totalDragStartXRef.current = e.clientX;
            if (containerRef.current) {
                containerRef.current.style.cursor = 'grabbing';
            }

            // Clear selection on normal click if not dragging
            if (!e.shiftKey) {
                selectionRange.value = null;
            }
        }
    };

    const handleMouseUp = () => {
        isPanningRef.current = false;
        isSelectingRef.current = false;
        if (containerRef.current) {
            containerRef.current.style.cursor = 'grab';
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const totalWidth = viewportWidth.value;
        const { plotStartX, plotWidth } = getPlotLayout(totalWidth);

        // Handle panning
        if (isPanningRef.current) {
            const deltaX = e.clientX - panStartXRef.current;
            const scaledDeltaX = deltaX * (totalWidth / plotWidth);
            pan(scaledDeltaX);
            panStartXRef.current = e.clientX;
        }

        // Handle selection
        if (isSelectingRef.current) {
            const range = viewRange.value;
            if (range) {
                const rangeDuration = Math.max(1, range.end - range.start);
                const plotX = Math.max(0, Math.min(plotWidth, x - plotStartX));
                const currentTime = range.start + ((plotX / plotWidth) * rangeDuration);
                selectionRange.value = {
                    start: selectionStartTimeRef.current,
                    end: currentTime
                };
            }
        }

        // Calculate raw time and possibly snap to signal
        const range = viewRange.value;
        if (!range) {
            hoverX.value = null;
            hoverTime.value = null;
            hoverRow.value = null;
            return;
        }

        if (x < plotStartX || x > plotStartX + plotWidth) {
            hoverX.value = null;
            hoverTime.value = null;
            hoverRow.value = null;
            return;
        }

        const rawPlotX = x - plotStartX;
        const rangeDuration = Math.max(1, range.end - range.start);
        const pixelsPerMs = plotWidth / rangeDuration;
        const rawTime = range.start + (rawPlotX / pixelsPerMs);
        let snappedTime = rawTime;
        let snappedX = rawPlotX;

        // Snap to signal transitions if hovering over a signal row (below time axis)
        if (y > AXIS_HEIGHT) {
            const rowIndex = Math.floor((y - AXIS_HEIGHT) / ROW_HEIGHT);
            const signalKey = selectedSignals.value[rowIndex];

            if (signalKey) {
                const entries = waveformEntries.value[signalKey] || [];

                // Find nearest signal change within snap threshold (in pixels, ~20px)
                const snapThresholdPx = 20;
                const snapThresholdMs = snapThresholdPx / pixelsPerMs;

                let closestDiff = snapThresholdMs;

                for (const entry of entries) {
                    const entryTime = getTimestampMs(entry);
                    const diff = Math.abs(entryTime - rawTime);

                    if (diff < closestDiff) {
                        closestDiff = diff;
                        snappedTime = entryTime;
                    }
                }

                // Calculate snapped X position
                snappedX = (snappedTime - range.start) * pixelsPerMs;
            }
        }

        hoverX.value = plotStartX + snappedX;
        hoverTime.value = snappedTime;

        // Track row for tooltip
        if (y > AXIS_HEIGHT) {
            hoverRow.value = Math.floor((y - AXIS_HEIGHT) / ROW_HEIGHT);
        } else {
            hoverRow.value = null;
        }
    };

    const handleMouseLeave = () => {
        hoverX.value = null;
        hoverRow.value = null;
        hoverTime.value = null;
        isPanningRef.current = false;
        if (containerRef.current) {
            containerRef.current.style.cursor = 'grab';
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        const PAN_AMOUNT = 100; // pixels

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                pan(PAN_AMOUNT); // Pan left (positive moves view left in time)
                break;
            case 'ArrowRight':
                e.preventDefault();
                pan(-PAN_AMOUNT); // Pan right
                break;
        }
    };

    const handleClick = (e: MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const totalWidth = viewportWidth.value;
        const { plotStartX, plotWidth } = getPlotLayout(totalWidth);

        // If the user dragged more than 5 pixels, treat it as a pan/scroll, not a click
        const dragDistance = Math.abs(e.clientX - totalDragStartXRef.current);
        if (dragDistance > 5) return;

        // If click is on the time axis area, jump to that time
        if (y < AXIS_HEIGHT && x >= plotStartX && x <= plotStartX + plotWidth) {
            const range = viewRange.value;
            if (range) {
                const rangeDuration = Math.max(1, range.end - range.start);
                const plotX = x - plotStartX;
                const clickTime = range.start + ((plotX / plotWidth) * rangeDuration);
                jumpToTime(clickTime);
            }
            return;
        }

        // Check for SECS marker click
        if (y >= AXIS_HEIGHT) {
            const rowIndex = Math.floor((y - AXIS_HEIGHT) / ROW_HEIGHT);
            const signalKey = selectedSignals.value[rowIndex];
            if (signalKey && signalKey.startsWith('SECS::')) {
                const range = viewRange.value;
                if (!range) return;
                const rangeDuration = Math.max(1, range.end - range.start);
                const plotX = x - plotStartX;
                const clickTime = range.start + ((plotX / plotWidth) * rangeDuration);
                const entries = waveformEntries.value[signalKey] || [];

                // Find the nearest SECS entry
                let nearestEntry: LogEntry | null = null;
                let nearestDiff = 50; // ms threshold
                for (const entry of entries) {
                    const diff = Math.abs(getTimestampMs(entry) - clickTime);
                    if (diff < nearestDiff) {
                        nearestDiff = diff;
                        nearestEntry = entry;
                    }
                }
                if (nearestEntry) {
                    setSecsDialogEntry(nearestEntry);
                }
            }
        }
    };

    const isLoading = isWaveformLoading.value;
    const totalHeight = selectedSignals.value.length * ROW_HEIGHT + AXIS_HEIGHT;

    return (
        <div
            ref={containerRef}
            class="waveform-canvas-wrapper"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div class="waveform-canvas-inner" style={{ height: `${totalHeight}px`, position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    class="waveform-canvas"
                    style={{
                        width: '100%',
                        height: `${totalHeight}px`,
                        display: 'block'
                    }}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                />
                {isLoading && (
                    <div class="waveform-loading-indicator">
                        <div class="waveform-loading-spinner-small" />
                        <span class="waveform-loading-text-small">Loading...</span>
                        <div class="waveform-loading-progress-mini">
                            <div
                                class="waveform-loading-progress-bar-mini"
                                style={{ width: `${waveformLoadingProgress.value}%` }}
                            />
                        </div>
                        <button 
                            class="waveform-loading-cancel"
                            onClick={(e) => {
                                e.stopPropagation();
                                cancelWaveformLoading();
                            }}
                            title="Cancel loading"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
            <style>{`
                .waveform-canvas-wrapper {
                    width: 100%;
                    height: 100%;
                    overflow-x: hidden;
                    overflow-y: auto;
                    background: ${COLORS.canvasBg};
                    cursor: grab;
                    outline: none;
                    position: relative;
                }
                .waveform-canvas-wrapper:focus {
                    box-shadow: inset 0 0 0 2px var(--primary-accent);
                }
                .waveform-canvas-wrapper::-webkit-scrollbar {
                    width: 8px;
                }
                .waveform-canvas-wrapper::-webkit-scrollbar-track {
                    background: ${COLORS.canvasBg};
                }
                .waveform-canvas-wrapper::-webkit-scrollbar-thumb {
                    background: rgba(139, 148, 158, 0.4);
                    border-radius: 4px;
                }
                .waveform-canvas-wrapper::-webkit-scrollbar-thumb:hover {
                    background: rgba(139, 148, 158, 0.6);
                }
                .waveform-canvas-inner {
                    position: relative;
                    min-height: 100%;
                    pointer-events: none;
                }
                .waveform-canvas {
                    pointer-events: auto;
                }
                /* Non-blocking loading indicator - positioned in corner */
                .waveform-loading-indicator {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: rgba(22, 27, 34, 0.95);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    z-index: 10;
                    box-shadow: var(--shadow-lg);
                    pointer-events: auto;
                }
                .waveform-loading-spinner-small {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(77, 182, 226, 0.2);
                    border-top-color: var(--primary-accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    flex-shrink: 0;
                }
                .waveform-loading-text-small {
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .waveform-loading-progress-mini {
                    width: 60px;
                    height: 3px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .waveform-loading-progress-bar-mini {
                    height: 100%;
                    background: var(--primary-accent);
                    transition: width 0.2s ease;
                }
                .waveform-loading-cancel {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 2px;
                    border-radius: 3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: 4px;
                }
                .waveform-loading-cancel:hover {
                    background: rgba(248, 81, 73, 0.15);
                    color: var(--accent-error);
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            {/* SECS Message Dialog */}
            {secsDialogEntry && (
                <SECSMessageDialog
                    isOpen={secsDialogEntry !== null}
                    onClose={() => setSecsDialogEntry(null)}
                    entry={secsDialogEntry}
                />
            )}
        </div>
    );
}

function drawTimeAxis(
    ctx: CanvasRenderingContext2D,
    start: number,
    end: number,
    pixelsPerMs: number,
    plotStartX: number,
    plotWidth: number,
    totalWidth: number,
    totalHeight: number
) {
    const [major] = getTickIntervals(pixelsPerMs);

    // Axis background
    ctx.fillStyle = COLORS.axisBg;
    ctx.fillRect(0, 0, totalWidth, AXIS_HEIGHT);

    // Major ticks and labels
    const startTick = Math.floor(start / major) * major;
    for (let t = startTick; t <= end + major; t += major) {
        const x = plotStartX + ((t - start) * pixelsPerMs);
        if (x < plotStartX - 100 || x > plotStartX + plotWidth + 100) continue;

        // Tick mark
        ctx.strokeStyle = COLORS.axisText;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, AXIS_HEIGHT - 8);
        ctx.lineTo(x, AXIS_HEIGHT);
        ctx.stroke();

        // Label
        ctx.fillStyle = COLORS.axisTextBold;
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatTimestamp(t), x, AXIS_HEIGHT - 12);

        // Vertical grid line
        ctx.strokeStyle = COLORS.gridMajor;
        ctx.beginPath();
        ctx.moveTo(x, AXIS_HEIGHT);
        ctx.lineTo(x, totalHeight);
        ctx.stroke();
    }

    // Bottom border of axis
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, AXIS_HEIGHT);
    ctx.lineTo(totalWidth, AXIS_HEIGHT);
    ctx.stroke();
}

function drawBooleanSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number, width: number, beforeBoundary?: LogEntry) {
    const PADDING = 8;
    const highY = PADDING;
    const lowY = height - PADDING;

    // Prepend boundary entry if it exists and first visible entry is after viewport start
    const effectiveEntries = [...entries];
    if (beforeBoundary && entries.length > 0) {
        const firstX = (getTimestampMs(entries[0]) - startTime) * pixelsPerMs;
        if (firstX > 0) {
            // Create a synthetic entry at viewport start with boundary value
            effectiveEntries.unshift({
                ...beforeBoundary,
                timestamp: startTime // Set to viewport start (milliseconds)
            });
        }
    } else if (beforeBoundary && entries.length === 0) {
        // Only boundary, draw it across the viewport
        effectiveEntries.push({
            ...beforeBoundary,
            timestamp: startTime // milliseconds
        });
    }

    // Draw high state fill (green glow effect)
    ctx.fillStyle = COLORS.booleanFill;
    effectiveEntries.forEach((entry, i) => {
        const val = entry.value === true || entry.value === "true" || entry.value === 1 || entry.value === "1";
        if (val) {
            const x_start = Math.max(0, (getTimestampMs(entry) - startTime) * pixelsPerMs);
            const nextEntry = effectiveEntries[i + 1];
            const x_end = nextEntry ? (getTimestampMs(nextEntry) - startTime) * pixelsPerMs : width + 100;

            if (x_end > 0 && x_start < width) {
                ctx.fillRect(x_start, highY - 4, x_end - x_start, lowY - highY + 8);
            }
        }
    });

    // Draw waveform line (bright green)
    ctx.strokeStyle = COLORS.booleanLine;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let started = false;
    let lastY = lowY;

    effectiveEntries.forEach((entry) => {
        const x = (getTimestampMs(entry) - startTime) * pixelsPerMs;
        const val = entry.value === true || entry.value === "true" || entry.value === 1 || entry.value === "1";
        const y = val ? highY : lowY;

        if (!started) {
            // Start from x=0 if we have boundary data that starts before viewport
            ctx.moveTo(Math.max(0, x), y);
            started = true;
        } else {
            ctx.lineTo(x, lastY);
            ctx.lineTo(x, y);
        }
        lastY = y;
    });

    if (effectiveEntries.length > 0) {
        ctx.lineTo(width + 100, lastY);
    }
    ctx.stroke();

    // Draw transition markers (orange dots) - only for original entries
    entries.forEach((entry, i) => {
        if (i === 0) return;
        const val = entry.value === true || entry.value === "true" || entry.value === 1 || entry.value === "1";
        const prevEntry = entries[i - 1];
        const prevVal = prevEntry.value === true || prevEntry.value === "true" || prevEntry.value === 1 || prevEntry.value === "1";

        if (val !== prevVal) {
            const x = (getTimestampMs(entry) - startTime) * pixelsPerMs;
            if (x > 0 && x < width) {
                ctx.fillStyle = COLORS.transition;
                ctx.beginPath();
                ctx.arc(x, height / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });
}

function drawStateSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number, width: number, _rowIndex: number, beforeBoundary?: LogEntry) {
    ctx.lineWidth = 1;

    // Prepend boundary entry if it exists and first visible entry is after viewport start
    const effectiveEntries = [...entries];
    if (beforeBoundary && entries.length > 0) {
        const firstX = (getTimestampMs(entries[0]) - startTime) * pixelsPerMs;
        if (firstX > 0) {
            // Create a synthetic entry at viewport start with boundary value
            effectiveEntries.unshift({
                ...beforeBoundary,
                timestamp: startTime // Set to viewport start
            });
        }
    } else if (beforeBoundary && entries.length === 0) {
        // Only boundary, draw it across the viewport
        effectiveEntries.push({
            ...beforeBoundary,
            timestamp: startTime
        });
    }

    // Simple hash function for consistent value->color mapping
    const hashString = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    };

    effectiveEntries.forEach((entry, i) => {
        const x = (getTimestampMs(entry) - startTime) * pixelsPerMs;
        const nextX = (i < effectiveEntries.length - 1)
            ? (getTimestampMs(effectiveEntries[i + 1]) - startTime) * pixelsPerMs
            : width + 100;

        if (nextX < 0 || x > width) return;

        const valStr = String(entry.value);
        // Use hash of value for consistent coloring (same value = same color)
        const colorIndex = hashString(valStr) % COLORS.stateColors.length;

        // Background box with colored fill
        ctx.fillStyle = COLORS.stateColors[colorIndex];
        ctx.fillRect(Math.max(0, x), 0, Math.min(nextX, width) - Math.max(0, x), height);

        // Border
        ctx.strokeStyle = COLORS.stateBorder;
        ctx.strokeRect(Math.max(0, x), 0, Math.min(nextX, width) - Math.max(0, x), height);

        // Text - "sticky" label logic
        ctx.fillStyle = COLORS.stateText;
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(valStr).width;
        const visibleWidth = Math.min(nextX, width) - Math.max(0, x);

        if (visibleWidth > textWidth + 12) {
            // If the start is off-screen to the left, "stick" the label to the left edge
            const labelX = x < 0 ? 6 : x + 6;
            // Only draw if there's room and it's within the segment
            if (labelX + textWidth < Math.min(nextX, width) - 6) {
                ctx.fillText(valStr, labelX, height / 2);
            }
        }
    });
}

function drawSelection(
    ctx: CanvasRenderingContext2D,
    range: { start: number, end: number },
    startTime: number,
    pixelsPerMs: number,
    height: number,
    plotStartX: number,
    plotWidth: number
) {
    const x1 = plotStartX + ((range.start - startTime) * pixelsPerMs);
    const x2 = plotStartX + ((range.end - startTime) * pixelsPerMs);

    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    const plotEndX = plotStartX + plotWidth;

    // Boundary check
    if (endX < plotStartX || startX > plotEndX) return;

    const visibleX1 = Math.max(plotStartX, startX);
    const visibleX2 = Math.min(plotEndX, endX);

    // Draw highlight area
    ctx.fillStyle = COLORS.selectionBg;
    ctx.fillRect(visibleX1, 0, visibleX2 - visibleX1, height);

    // Draw border lines
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    if (startX >= plotStartX && startX <= plotEndX) {
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
    }

    if (endX >= plotStartX && endX <= plotEndX) {
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    // Draw duration label
    const durationMs = Math.abs(range.end - range.start);
    const label = `${(durationMs / 1000).toFixed(3)}s`;

    ctx.font = 'bold 12px var(--font-mono)';
    const textMetrics = ctx.measureText(label);
    const labelWidth = textMetrics.width + 12;
    const labelX = startX + (endX - startX) / 2 - labelWidth / 2;
    const labelY = AXIS_HEIGHT + 10;

    // Background for label
    ctx.fillStyle = COLORS.selectionLabelBg;
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, 20, 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.stroke();

    // Text for label
    ctx.fillStyle = COLORS.axisTextBold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + labelWidth / 2, labelY + 10);
}

function drawBookmarks(
    ctx: CanvasRenderingContext2D,
    bookmarks: Bookmark[],
    startTime: number,
    pixelsPerMs: number,
    height: number,
    plotStartX: number,
    plotWidth: number
) {
    const plotEndX = plotStartX + plotWidth;

    bookmarks.forEach(bookmark => {
        const x = plotStartX + ((bookmark.time - startTime) * pixelsPerMs);

        // Skip if bookmark is outside visible area
        if (x < plotStartX - 20 || x > plotEndX + 20) return;

        // Draw vertical line
        ctx.strokeStyle = COLORS.bookmarkLine;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, AXIS_HEIGHT);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw flag at top
        const flagWidth = 12;
        const flagHeight = 16;

        ctx.fillStyle = COLORS.bookmarkFlag;
        ctx.beginPath();
        ctx.moveTo(x, AXIS_HEIGHT - 2);
        ctx.lineTo(x + flagWidth, AXIS_HEIGHT - 2 + flagHeight / 2);
        ctx.lineTo(x, AXIS_HEIGHT - 2 + flagHeight);
        ctx.closePath();
        ctx.fill();

        // Draw small dot at the base of the line as an anchor point
        ctx.fillStyle = COLORS.bookmarkLine;
        ctx.beginPath();
        ctx.arc(x, AXIS_HEIGHT, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawTooltip(ctx: CanvasRenderingContext2D, x: number, rowY: number, signalKey: string, value: boolean | string | number, width: number) {
    const [device, signal] = signalKey.split('::');
    let valStr = String(value);
    // Truncate long values to prevent tooltip from covering the screen
    const MAX_VAL_LEN = 60;
    if (valStr.length > MAX_VAL_LEN) {
        valStr = valStr.slice(0, MAX_VAL_LEN) + '...';
    }
    const displayText = `${signal}: ${valStr}`;

    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    const textWidth = ctx.measureText(displayText).width;
    const padding = 8;
    const tooltipWidth = textWidth + padding * 2;
    const tooltipHeight = 24;

    // Position tooltip to the right of cursor, unless it would go off-screen
    let tooltipX = x + 12;
    if (tooltipX + tooltipWidth > width) {
        tooltipX = x - tooltipWidth - 12;
    }
    const tooltipY = rowY + 8;

    // Background
    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(77, 182, 226, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, tooltipX + padding, tooltipY + tooltipHeight / 2);

    // Device name (smaller, dimmed)
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(device, tooltipX + padding, tooltipY - 8);
}

function fitLabelToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;

    let end = text.length;
    while (end > 0 && ctx.measureText(`${text.slice(0, end)}...`).width > maxWidth) {
        end--;
    }

    if (end <= 0) return '...';
    return `${text.slice(0, end)}...`;
}

function drawSignalLabels(
    ctx: CanvasRenderingContext2D,
    signals: string[],
    drawStart: number,
    drawEnd: number,
    gutterWidth: number
) {
    if (signals.length === 0 || drawEnd < drawStart) return;

    const textWidth = gutterWidth - SIGNAL_LABEL_PADDING_X * 2;

    // Header ("Signal")
    ctx.fillStyle = COLORS.signalLabelHeaderBg;
    ctx.fillRect(0, 0, gutterWidth, AXIS_HEIGHT);
    ctx.fillStyle = COLORS.signalLabelHeaderText;
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Signal', SIGNAL_LABEL_PADDING_X, AXIS_HEIGHT / 2);

    for (let rowIndex = drawStart; rowIndex <= drawEnd; rowIndex++) {
        const signalKey = signals[rowIndex];
        if (!signalKey) continue;

        const [device, signal] = signalKey.split('::');
        const y = AXIS_HEIGHT + (rowIndex * ROW_HEIGHT);
        const isFocused = focusedSignal.value === signalKey;

        ctx.fillStyle = isFocused ? COLORS.signalLabelRowFocusedBg : COLORS.signalLabelRowBg;
        ctx.fillRect(0, y, gutterWidth, ROW_HEIGHT);

        const signalText = fitLabelToWidth(ctx, signal || signalKey, textWidth);
        ctx.fillStyle = COLORS.signalLabelSignalText;
        ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(signalText, SIGNAL_LABEL_PADDING_X, y + 24);

        if (device && signal) {
            const deviceText = fitLabelToWidth(ctx, device, textWidth);
            ctx.fillStyle = COLORS.signalLabelDeviceText;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText(deviceText, SIGNAL_LABEL_PADDING_X, y + 41);
        }
    }

    // Vertical divider between label gutter and waveform area
    ctx.strokeStyle = COLORS.signalLabelDivider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gutterWidth + 0.5, 0);
    ctx.lineTo(gutterWidth + 0.5, AXIS_HEIGHT + signals.length * ROW_HEIGHT);
    ctx.stroke();
}

/**
 * SECS-specific waveform rendering with 2-lane display (SEND / RECV).
 * 
 * - Two lanes: SECS_SEND (top) and SECS_RECV (bottom)
 * - ▲ markers at message timestamps with stream/function labels
 * - No connector lines between SEND and RECV markers
 */
const SECS_COLORS = {
    marker: '#d29922',
    markerFill: 'rgba(210, 153, 34, 0.25)',
    bracket: 'rgba(163, 113, 247, 0.6)',
    bracketFill: 'rgba(163, 113, 247, 0.15)',
    label: '#e6edf3',
    muted: '#8b949e',
    bg: 'rgba(13, 17, 23, 0.4)',
};

function drawSECSSignal(
    ctx: CanvasRenderingContext2D,
    entries: LogEntry[],
    startTime: number,
    pixelsPerMs: number,
    height: number,
    width: number,
    _beforeBoundary?: LogEntry
) {
    if (entries.length === 0) return;

    // Two lanes: SEND (top half), RECV (bottom half) — no connector lines between them
    const laneMid = height / 2;
    const lanePadding = 4;

    // Both lanes use the same subtle background
    ctx.fillStyle = SECS_COLORS.markerFill;
    ctx.fillRect(0, lanePadding, width, laneMid - lanePadding * 2);
    ctx.fillRect(0, laneMid + lanePadding, width, laneMid - lanePadding * 2);

    // Lane divider
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, laneMid);
    ctx.lineTo(width, laneMid);
    ctx.stroke();
    ctx.setLineDash([]);

    // Lane labels
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = SECS_COLORS.muted;
    ctx.fillText('SEND', 6, lanePadding + 2);
    ctx.fillText('RECV', 6, laneMid + lanePadding + 2);

    // Collect marker positions per entry
    type SECSMarker = {
        entry: LogEntry;
        x: number;
        sfCode: string;
        category: string;
        systemByte: number;
    };
    const markers: SECSMarker[] = [];

    for (const entry of entries) {
        const ts = getTimestampMs(entry);
        const x = (ts - startTime) * pixelsPerMs;
        if (x < -20 || x > width + 20) continue;

        const msg = parseSECSValue(entry.value);
        markers.push({
            entry,
            x,
            sfCode: msg.streamFunction || entry.signalName,
            category: msg.direction || entry.category || '',
            systemByte: msg.systemByte || 0,
        });
    }

    // Draw markers — no connector lines between SEND/RECV
    for (const m of markers) {
        const isSend = m.category.toUpperCase() === 'SEND';
        const markerY = isSend ? lanePadding + 6 : laneMid + lanePadding + 6;
        const markerColor = SECS_COLORS.marker;
        const markerSize = 8;

        // Draw ▲ marker
        ctx.fillStyle = markerColor;
        ctx.beginPath();
        ctx.moveTo(m.x, markerY);
        ctx.lineTo(m.x - markerSize / 2, markerY + markerSize);
        ctx.lineTo(m.x + markerSize / 2, markerY + markerSize);
        ctx.closePath();
        ctx.fill();

        // Draw marker outline
        ctx.strokeStyle = 'rgba(13, 17, 23, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x, markerY);
        ctx.lineTo(m.x - markerSize / 2, markerY + markerSize);
        ctx.lineTo(m.x + markerSize / 2, markerY + markerSize);
        ctx.closePath();
        ctx.stroke();

        // S/F code label above marker — green for SEND, blue for RECV
        ctx.fillStyle = isSend ? '#3fb950' : '#58a6ff';
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(m.sfCode, m.x, markerY - 2);

        // System byte label below marker
        ctx.fillStyle = SECS_COLORS.muted;
        ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textBaseline = 'top';
        if (m.systemByte > 0) {
            ctx.fillText(`#${m.systemByte}`, m.x, markerY + markerSize + 2);
        }
    }
}
