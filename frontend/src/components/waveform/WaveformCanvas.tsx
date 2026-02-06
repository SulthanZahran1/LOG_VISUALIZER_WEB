import { useEffect, useRef } from 'preact/hooks';
import {
    viewRange,
    waveformEntries,
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
    hoverX,
    hoverRow
} from '../../stores/waveformStore';
import { sortedBookmarks, type Bookmark } from '../../stores/bookmarkStore';
import type { LogEntry } from '../../models/types';
import { formatTimestamp, getTickIntervals, findFirstIndexAtTime } from '../../utils/TimeAxisUtils';

const ROW_HEIGHT = 60;

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

        const pixelsPerMs = zoomLevel.value;

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
        drawTimeAxis(ctx, range.start, range.end, pixelsPerMs, width, height);

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

            ctx.save();
            ctx.translate(0, yBase + yPadding);

            if (visibleEntries.length > 0) {
                const firstEntry = visibleEntries[0];
                if (firstEntry.signalType === 'boolean' || typeof firstEntry.value === 'boolean') {
                    drawBooleanSignal(ctx, visibleEntries, range.start, pixelsPerMs, plotHeight, width);
                } else {
                    drawStateSignal(ctx, visibleEntries, range.start, pixelsPerMs, plotHeight, width, rowIndex);
                }
            }

            ctx.restore();
        }

        // Draw selection
        const selection = selectionRange.value;
        if (selection) {
            drawSelection(ctx, selection, range.start, pixelsPerMs, height, width);
        }

        // Draw cursor line if hovering
        const currentHoverX = hoverX.value;
        if (currentHoverX !== null && currentHoverX >= 0 && currentHoverX <= width) {
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
        drawBookmarks(ctx, sortedBookmarks.value, range.start, pixelsPerMs, height, width);

        // Draw hover tooltip
        const hoverRowValue = hoverRow.value;
        if (currentHoverX !== null && hoverRowValue !== null && hoverRowValue >= 0 && hoverRowValue < selectedSignals.value.length) {
            const signalKey = selectedSignals.value[hoverRowValue];
            const entries = waveformEntries.value[signalKey] || [];
            const hTime = hoverTime.value;
            if (hTime !== null && entries.length > 0) {
                let valueAtTime: any = entries[0].value;
                for (const e of entries) {
                    if (getTimestampMs(e) <= hTime) valueAtTime = e.value;
                    else break;
                }
                drawTooltip(ctx, currentHoverX, AXIS_HEIGHT + hoverRowValue * ROW_HEIGHT, signalKey, valueAtTime, width);
            }
        }
    // Dependencies: all the signals that should trigger a re-render
    }, [viewportWidth.value, selectedSignals.value.length, viewRange.value?.start, viewRange.value?.end, 
        zoomLevel.value, waveformEntries.value, selectionRange.value, hoverX.value, hoverRow.value,
        hoverTime.value, focusedSignal.value, deviceColors.value, sortedBookmarks.value]);

    const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            zoomAt(e.deltaY, x);
        } else {
            if (e.deltaX !== 0) {
                e.preventDefault();
                pan(-e.deltaX);
            }
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;

        if (e.shiftKey && e.button === 0) {
            // Start selection
            isSelectingRef.current = true;
            selectionStartXRef.current = x;

            const range = viewRange.value;
            if (range) {
                const startTime = range.start + (x / zoomLevel.value);
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

        // Handle panning
        if (isPanningRef.current) {
            const deltaX = e.clientX - panStartXRef.current;
            pan(deltaX);
            panStartXRef.current = e.clientX;
        }

        // Handle selection
        if (isSelectingRef.current) {
            const range = viewRange.value;
            if (range) {
                const currentTime = range.start + (x / zoomLevel.value);
                selectionRange.value = {
                    start: selectionStartTimeRef.current,
                    end: currentTime
                };
            }
        }

        // Calculate raw time and possibly snap to signal
        const range = viewRange.value;
        if (!range) {
            hoverX.value = x;
            return;
        }

        const rawTime = range.start + (x / zoomLevel.value);
        let snappedTime = rawTime;
        let snappedX = x;

        // Snap to signal transitions if hovering over a signal row (below time axis)
        if (y > AXIS_HEIGHT) {
            const rowIndex = Math.floor((y - AXIS_HEIGHT) / ROW_HEIGHT);
            const signalKey = selectedSignals.value[rowIndex];

            if (signalKey) {
                const entries = waveformEntries.value[signalKey] || [];

                // Find nearest signal change within snap threshold (in pixels, ~20px)
                const snapThresholdPx = 20;
                const snapThresholdMs = snapThresholdPx / zoomLevel.value;

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
                snappedX = (snappedTime - range.start) * zoomLevel.value;
            }
        }

        hoverX.value = snappedX;
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

        // If the user dragged more than 5 pixels, treat it as a pan/scroll, not a click
        const dragDistance = Math.abs(e.clientX - totalDragStartXRef.current);
        if (dragDistance > 5) return;

        // If click is on the time axis area, jump to that time
        if (y < AXIS_HEIGHT) {
            const range = viewRange.value;
            if (range) {
                const clickTime = range.start + (x / zoomLevel.value);
                jumpToTime(clickTime);
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
                    <div class="waveform-loading-overlay">
                        <div class="waveform-loading-spinner" />
                        <span class="waveform-loading-text">Loading signal data...</span>
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
                }
                .waveform-loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: rgba(13, 17, 23, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    z-index: 10;
                }
                .waveform-loading-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(77, 182, 226, 0.3);
                    border-top-color: var(--primary-accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                .waveform-loading-text {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

function drawTimeAxis(ctx: CanvasRenderingContext2D, start: number, end: number, pixelsPerMs: number, width: number, totalHeight: number) {
    const [major] = getTickIntervals(pixelsPerMs);

    // Axis background
    ctx.fillStyle = COLORS.axisBg;
    ctx.fillRect(0, 0, width, AXIS_HEIGHT);

    // Major ticks and labels
    const startTick = Math.floor(start / major) * major;
    for (let t = startTick; t <= end + major; t += major) {
        const x = (t - start) * pixelsPerMs;
        if (x < -100 || x > width + 100) continue;

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
    ctx.lineTo(width, AXIS_HEIGHT);
    ctx.stroke();
}

function drawBooleanSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number, width: number) {
    const PADDING = 8;
    const highY = PADDING;
    const lowY = height - PADDING;

    // Draw high state fill (green glow effect)
    ctx.fillStyle = COLORS.booleanFill;
    entries.forEach((entry, i) => {
        const val = entry.value === true || entry.value === "true" || entry.value === 1 || entry.value === "1";
        if (val) {
            const x_start = (getTimestampMs(entry) - startTime) * pixelsPerMs;
            const nextEntry = entries[i + 1];
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

    entries.forEach((entry) => {
        const x = (getTimestampMs(entry) - startTime) * pixelsPerMs;
        const val = entry.value === true || entry.value === "true" || entry.value === 1 || entry.value === "1";
        const y = val ? highY : lowY;

        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, lastY);
            ctx.lineTo(x, y);
        }
        lastY = y;
    });

    if (entries.length > 0) {
        ctx.lineTo(width + 100, lastY);
    }
    ctx.stroke();

    // Draw transition markers (orange dots)
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

function drawStateSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number, width: number, _rowIndex: number) {
    ctx.lineWidth = 1;

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

    entries.forEach((entry, i) => {
        const x = (getTimestampMs(entry) - startTime) * pixelsPerMs;
        const nextX = (i < entries.length - 1)
            ? (getTimestampMs(entries[i + 1]) - startTime) * pixelsPerMs
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

function drawSelection(ctx: CanvasRenderingContext2D, range: { start: number, end: number }, startTime: number, pixelsPerMs: number, height: number, width: number) {
    const x1 = (range.start - startTime) * pixelsPerMs;
    const x2 = (range.end - startTime) * pixelsPerMs;

    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);

    // Boundary check
    if (endX < 0 || startX > width) return;

    const visibleX1 = Math.max(0, startX);
    const visibleX2 = Math.min(width, endX);

    // Draw highlight area
    ctx.fillStyle = COLORS.selectionBg;
    ctx.fillRect(visibleX1, 0, visibleX2 - visibleX1, height);

    // Draw border lines
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    if (startX >= 0 && startX <= width) {
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
    }

    if (endX >= 0 && endX <= width) {
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

function drawBookmarks(ctx: CanvasRenderingContext2D, bookmarks: Bookmark[], startTime: number, pixelsPerMs: number, height: number, width: number) {
    bookmarks.forEach(bookmark => {
        const x = (bookmark.time - startTime) * pixelsPerMs;

        // Skip if bookmark is outside visible area
        if (x < -20 || x > width + 20) return;

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

function drawTooltip(ctx: CanvasRenderingContext2D, x: number, rowY: number, signalKey: string, value: any, width: number) {
    const [device, signal] = signalKey.split('::');
    const valStr = String(value);
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
