/**
 * Utility functions for time axis and timestamp formatting
 */

/**
 * Format a Unix ms timestamp to HH:MM:SS.mmm (time only, for waveform axis)
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
 * Format a Unix ms timestamp to YYYY-MM-DD HH:MM:SS.mmm (full date-time, for log table)
 */
export function formatDateTime(ms: number): string {
    const date = new Date(ms);
    const Y = date.getUTCFullYear();
    const M = String(date.getUTCMonth() + 1).padStart(2, '0');
    const D = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const mss = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}.${mss}`;
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

interface HasTimestamp {
    timestamp: number;
}

/**
 * Binary search for the first index i where array[i].timestamp >= targetTime
 */
export function findFirstIndexAtTime<T extends HasTimestamp>(array: T[], targetTime: number): number {
    let low = 0;
    let high = array.length - 1;
    let result = array.length;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (array[mid].timestamp >= targetTime) {
            result = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    return result;
}
