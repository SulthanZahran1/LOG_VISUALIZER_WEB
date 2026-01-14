import { useEffect, useRef } from 'preact/hooks';
import { viewRange, waveformEntries, selectedSignals, viewportWidth } from '../../stores/waveformStore';
import type { LogEntry } from '../../models/types';

const ROW_HEIGHT = 48;

export function WaveformCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const range = viewRange.value;

            // Clear
            ctx.clearRect(0, 0, width, height);

            if (!range) return;

            const duration = range.end - range.start;
            const pixelsPerMs = width / duration;

            // Draw background rows
            selectedSignals.value.forEach((_, i) => {
                ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                ctx.fillRect(0, i * ROW_HEIGHT, width, ROW_HEIGHT);

                // Row separator
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.moveTo(0, (i + 1) * ROW_HEIGHT);
                ctx.lineTo(width, (i + 1) * ROW_HEIGHT);
                ctx.stroke();
            });

            // Draw Signals
            selectedSignals.value.forEach((key, rowIndex) => {
                const entries = waveformEntries.value[key] || [];
                if (entries.length === 0) return;

                const yBase = rowIndex * ROW_HEIGHT;
                const yPadding = 8;
                const plotHeight = ROW_HEIGHT - (yPadding * 2);

                ctx.save();
                ctx.translate(0, yBase + yPadding);

                // Detect Signal Type (simplified for now)
                const firstEntry = entries[0];
                if (firstEntry.signalType === 'boolean' || typeof firstEntry.value === 'boolean') {
                    drawBooleanSignal(ctx, entries, range.start, pixelsPerMs, plotHeight);
                } else {
                    drawStateSignal(ctx, entries, range.start, pixelsPerMs, plotHeight);
                }

                ctx.restore();
            });
        };

        render();
    }, [viewRange.value, waveformEntries.value, selectedSignals.value, viewportWidth.value]);

    return (
        <canvas
            ref={canvasRef}
            class="waveform-canvas"
            width={viewportWidth.value}
            height={selectedSignals.value.length * ROW_HEIGHT}
        />
    );
}

function drawBooleanSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number) {
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    entries.forEach((entry, i) => {
        const x = (entry.timestamp - startTime) * pixelsPerMs;
        const val = entry.value === true || entry.value === "true";
        const y = val ? 0 : height;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            // Horizontal line from prev entry's state
            const prevVal = entries[i - 1].value === true || entries[i - 1].value === "true";
            const prevY = prevVal ? 0 : height;

            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
}

function drawStateSignal(ctx: CanvasRenderingContext2D, entries: LogEntry[], startTime: number, pixelsPerMs: number, height: number) {
    ctx.lineWidth = 1;

    entries.forEach((entry, i) => {
        const x = (entry.timestamp - startTime) * pixelsPerMs;
        const nextX = (i < entries.length - 1)
            ? (entries[i + 1].timestamp - startTime) * pixelsPerMs
            : ctx.canvas.width;

        const valStr = String(entry.value);

        // Background box
        ctx.fillStyle = i % 2 === 0 ? 'rgba(66, 133, 244, 0.2)' : 'rgba(77, 182, 226, 0.2)';
        ctx.fillRect(x, 0, nextX - x, height);

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(x, 0, nextX - x, height);

        // Text
        if (nextX - x > 20) {
            ctx.fillStyle = '#E0E0E0';
            ctx.font = '10px Roboto, sans-serif';
            ctx.fillText(valStr, x + 4, height / 2 + 4, nextX - x - 8);
        }
    });
}
