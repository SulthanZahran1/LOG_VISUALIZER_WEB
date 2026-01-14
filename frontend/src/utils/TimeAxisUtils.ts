/**
 * Utility functions for time axis and timestamp formatting
 */

/**
 * Format a Unix ms timestamp to HH:MM:SS.mmm
 */
export function formatTimestamp(ms: number): string {
    const date = new Date(ms);
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const mss = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${mss}`;
}

/**
 * Calculate dynamic tick intervals based on pixels per millisecond
 */
export function getTickIntervals(zoom: number): number[] {
    // zoom = pixels / ms
    // intervals in ms: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s, 30s, 1m, 5m, 10m...
    const commonIntervals = [
        1, 2, 5, 10, 20, 50, 100, 200, 500,
        1000, 2000, 5000, 10000, 30000,
        60000, 300000, 600000, 1800000, 3600000
    ];

    // We want roughly 100-200 pixels between major ticks
    const targetPx = 150;

    let interval = commonIntervals[0];
    for (const i of commonIntervals) {
        if (i * zoom >= targetPx) {
            interval = i;
            break;
        }
        interval = i;
    }

    return [interval, interval / 5]; // [major, minor]
}
