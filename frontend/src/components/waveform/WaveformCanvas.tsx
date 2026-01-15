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
    selectionRange
} from '../../stores/waveformStore';
import type { LogEntry } from '../../models/types';
import { formatTimestamp, getTickIntervals, findFirstIndexAtTime } from '../../utils/TimeAxisUtils';

const ROW_HEIGHT = 60;
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
};

export function WaveformCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hoverXRef = useRef<number | null>(null);

    // Panning state refs
    const isPanningRef = useRef(false);
    const panStartXRef = useRef(0);
    const totalDragStartXRef = useRef(0);

    // Selection state refs
    const isSelectingRef = useRef(false);
    const selectionStartXRef = useRef(0);
    const selectionStartTimeRef = useRef(0);

    // Resize Observer to update viewportWidth
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                viewportWidth.value = entry.contentRect.width;
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = viewportWidth.value;
            const height = selectedSignals.value.length * ROW_HEIGHT + AXIS_HEIGHT;

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);

            // Clear with dark background
            ctx.fillStyle = COLORS.canvasBg;
            ctx.fillRect(0, 0, width, height);

            const range = viewRange.value;
            if (!range) {
                animationFrameId = requestAnimationFrame(render); // Keep looping even if not ready
                return;
            }

            const pixelsPerMs = zoomLevel.value;

            // Draw row backgrounds
            selectedSignals.value.forEach((_, i) => {
                const y = AXIS_HEIGHT + (i * ROW_HEIGHT);
                ctx.fillStyle = i % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
                ctx.fillRect(0, y, width, ROW_HEIGHT);

                // Row separator
                ctx.strokeStyle = COLORS.gridMinor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + ROW_HEIGHT);
                ctx.lineTo(width, y + ROW_HEIGHT);
                ctx.stroke();
            });

            // Draw Time Axis
            drawTimeAxis(ctx, range.start, range.end, pixelsPerMs, width, height);

            // Draw Signals
            selectedSignals.value.forEach((key, rowIndex) => {
                const allEntries = waveformEntries.value[key] || [];
                const yBase = AXIS_HEIGHT + (rowIndex * ROW_HEIGHT);
                const yPadding = 8;
                const plotHeight = ROW_HEIGHT - (yPadding * 2);

                // --- Visible Window Slicing (Optimization) ---
                // Use binary search to find the first entry at or after range.start
                // Include a small buffer (1 before, all after) to ensure transitions are drawn
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
            });

            // Draw selection
            const selection = selectionRange.value;
            if (selection) {
                drawSelection(ctx, selection, range.start, pixelsPerMs, height, width);
            }

            // Draw cursor line if hovering
            const currentHoverX = hoverXRef.current;
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

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, []); // Empty dependency array: render loop runs continuously and pulls fresh signal values

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
        hoverXRef.current = x;

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

        // Update hover time for toolbar readout
        const range = viewRange.value;
        if (range) {
            const time = range.start + (x / zoomLevel.value);
            hoverTime.value = time;
        }
    };

    const handleMouseLeave = () => {
        hoverXRef.current = null;
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

    return (
        <div
            ref={containerRef}
            class="waveform-canvas-wrapper"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <canvas
                ref={canvasRef}
                class="waveform-canvas"
                style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
            />
            <style>{`
                .waveform-canvas-wrapper {
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: ${COLORS.canvasBg};
                    cursor: grab;
                    outline: none;
                }
                .waveform-canvas-wrapper:focus {
                    box-shadow: inset 0 0 0 2px var(--primary-accent);
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
            const x_start = (entry.timestamp - startTime) * pixelsPerMs;
            const nextEntry = entries[i + 1];
            const x_end = nextEntry ? (nextEntry.timestamp - startTime) * pixelsPerMs : width + 100;

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
        const x = (entry.timestamp - startTime) * pixelsPerMs;
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
            const x = (entry.timestamp - startTime) * pixelsPerMs;
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
        const x = (entry.timestamp - startTime) * pixelsPerMs;
        const nextX = (i < entries.length - 1)
            ? (entries[i + 1].timestamp - startTime) * pixelsPerMs
            : width + 100;

        if (nextX < 0 || x > width) return;

        const valStr = String(entry.value);
        // Use hash of value for consistent coloring (same value = same color)
        const colorIndex = hashString(valStr) % COLORS.stateColors.length;

        // Background box with colored fill
        ctx.fillStyle = COLORS.stateColors[colorIndex];
        ctx.fillRect(x, 0, nextX - x, height);

        // Border
        ctx.strokeStyle = COLORS.stateBorder;
        ctx.strokeRect(x, 0, nextX - x, height);

        // Text
        if (nextX - x > 30) {
            ctx.fillStyle = COLORS.stateText;
            ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const textWidth = ctx.measureText(valStr).width;
            if (textWidth < (nextX - x - 12)) {
                ctx.fillText(valStr, x + 6, height / 2);
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
