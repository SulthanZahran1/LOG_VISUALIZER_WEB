import { signal, computed, effect } from '@preact/signals';
import { getParseChunk } from '../api/client';
import { currentSession } from './logStore';
import type { LogEntry, TimeRange } from '../models/types';

// Viewport State
export const scrollOffset = signal(0); // start timestamp in ms
export const zoomLevel = signal(1); // pixels per millisecond
export const viewportWidth = signal(800); // Updated by resize observer
export const hoverTime = signal<number | null>(null);

// Signal Selection
export const selectedSignals = signal<string[]>([]); // "DeviceId::SignalName"
export const waveformEntries = signal<Record<string, LogEntry[]>>({});

// UI State
export const isDragging = signal(false);
export const showSidebar = signal(true);

// Computed view properties
export const viewRange = computed<TimeRange | null>(() => {
    if (!currentSession.value || currentSession.value.startTime === undefined) return null;

    // Duration we can see in the viewport
    const viewportDuration = viewportWidth.value / zoomLevel.value;

    return {
        start: scrollOffset.value,
        end: scrollOffset.value + viewportDuration
    };
});

/**
 * Initialize view range from session info
 */
effect(() => {
    const session = currentSession.value;
    if (session && session.status === 'complete' && session.startTime !== undefined) {
        // Only reset if scrollOffset is 0
        if (scrollOffset.value === 0) {
            scrollOffset.value = session.startTime;

            // Set initial zoom to fit roughly 10 seconds or the whole thing if shorter
            const sessionDuration = session.endTime! - session.startTime;
            const targetDuration = Math.min(sessionDuration, 10000) || 1000;
            zoomLevel.value = viewportWidth.value / targetDuration;
        }
    }
});

/**
 * Fetch entries for selected signals within visible window
 */
export async function updateWaveformEntries() {
    const range = viewRange.value;
    if (!currentSession.value || !range || selectedSignals.value.length === 0) return;

    try {
        const sessionId = currentSession.value.id;
        const { start, end } = range;

        // Fetch chunk from backend
        // Buffer by 20% on each side to make panning smoother
        const buffer = (end - start) * 0.2;
        const entries = await getParseChunk(sessionId, start - buffer, end + buffer);

        // Group by Signal Key
        const grouped: Record<string, LogEntry[]> = {};
        (entries as LogEntry[]).forEach((e: LogEntry) => {
            const key = `${e.deviceId}::${e.signalName}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        waveformEntries.value = grouped;
    } catch (err) {
        console.error('Failed to fetch waveform chunk', err);
    }
}

// Trigger update when viewRange or selectedSignals changes
effect(() => {
    // Only fetch if range actually shifted enough or signals changed
    updateWaveformEntries();
});

/**
 * Add or remove a signal from the waveform
 */
export function toggleSignal(deviceId: string, signalName: string) {
    const key = `${deviceId}::${signalName}`;
    console.log('[waveformStore] toggleSignal:', key);
    if (selectedSignals.value.includes(key)) {
        selectedSignals.value = selectedSignals.value.filter(s => s !== key);
    } else {
        selectedSignals.value = [...selectedSignals.value, key];
    }
}

/**
 * Zoom centered on a specific relative x position
 */
export function zoomAt(delta: number, x: number) {
    const currentRange = viewRange.value;
    if (!currentRange) return;

    const mouseTime = currentRange.start + (x / zoomLevel.value);

    const factor = delta > 0 ? 0.9 : 1.1;
    const newZoom = zoomLevel.value * factor;

    // Clamp zoom (from 1ms per pixel to 1 hour per pixel roughly)
    if (newZoom < 0.000001 || newZoom > 1000) return;

    // Adjust scrollOffset to keep mouseTime at the same pixel
    const newScrollOffset = mouseTime - (x / newZoom);

    zoomLevel.value = newZoom;
    scrollOffset.value = newScrollOffset;
}

/**
 * Pan by pixel delta
 */
export function pan(deltaX: number) {
    const timeDelta = deltaX / zoomLevel.value;
    scrollOffset.value -= timeDelta;

    // Soft clamp to session bounds (allow some overscroll)
    const session = currentSession.value;
    if (session && session.startTime !== undefined && session.endTime !== undefined) {
        const margin = (session.endTime - session.startTime) * 0.1;
        if (scrollOffset.value < session.startTime - margin) scrollOffset.value = session.startTime - margin;
        if (scrollOffset.value > session.endTime + margin) scrollOffset.value = session.endTime + margin;
    }
}

// Debugging
if (typeof window !== 'undefined') {
    (window as any).waveformStore = {
        scrollOffset,
        zoomLevel,
        viewportWidth,
        selectedSignals,
        waveformEntries,
        viewRange
    };
}
