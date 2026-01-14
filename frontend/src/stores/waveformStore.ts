import { signal, computed, effect } from '@preact/signals-core';
import { getParseChunk } from '../api/client';
import { currentSession } from './logStore';
import type { LogEntry, TimeRange } from '../models/types';

// Viewport State
export const viewRange = signal<TimeRange | null>(null);
export const zoomLevel = signal(1); // pixels per millisecond (base)
export const hoverTime = signal<number | null>(null);

// Signal Selection
export const selectedSignals = signal<string[]>([]); // "DeviceId::SignalName"
export const waveformEntries = signal<Record<string, LogEntry[]>>({});

// UI State
export const isDragging = signal(false);
export const showSidebar = signal(true);

// Computed view properties
export const viewportWidth = signal(800); // Updated by resize observer
export const msPerPixel = computed(() => 1 / (zoomLevel.value * 10)); // Arbitrary scale

/**
 * Initialize view range from session info
 */
effect(() => {
    if (currentSession.value && !viewRange.value) {
        // Assume session has a total time range. 
        // For now, if not provided, we wait for entries or set a default.
        // We'll calculate it from current log entries if available in logStore.
    }
});

/**
 * Fetch entries for selected signals within visible window
 */
export async function updateWaveformEntries() {
    if (!currentSession.value || !viewRange.value || selectedSignals.value.length === 0) return;

    try {
        const sessionId = currentSession.value.id;
        const { start, end } = viewRange.value;

        // Fetch chunk from backend
        const entries = await getParseChunk(sessionId, start, end);

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

/**
 * Add or remove a signal from the waveform
 */
export function toggleSignal(deviceId: string, signalName: string) {
    const key = `${deviceId}::${signalName}`;
    if (selectedSignals.value.includes(key)) {
        selectedSignals.value = selectedSignals.value.filter(s => s !== key);
    } else {
        selectedSignals.value = [...selectedSignals.value, key];
    }
    updateWaveformEntries();
}

/**
 * Zoom centered on a specific millisecond
 */
export function zoomAt(delta: number) {
    const factor = delta > 0 ? 0.9 : 1.1;
    const newZoom = zoomLevel.value * factor;

    // Clamp zoom
    if (newZoom < 0.0001 || newZoom > 1000) return;

    zoomLevel.value = newZoom;
}
