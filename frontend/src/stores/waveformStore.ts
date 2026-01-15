import { signal, computed, effect } from '@preact/signals';
import { getParseChunk } from '../api/client';
import { currentSession, logEntries } from './logStore';
import type { LogEntry, TimeRange } from '../models/types';

// Viewport State
export const scrollOffset = signal(0); // start timestamp in ms
export const zoomLevel = signal(1); // pixels per millisecond
export const viewportWidth = signal(800); // Updated by resize observer
export const hoverTime = signal<number | null>(null);

// Signal Selection
export const selectedSignals = signal<string[]>([]); // "DeviceId::SignalName"
export const waveformEntries = signal<Record<string, LogEntry[]>>({});

// Available Signals - computed from all log entries
export const availableSignals = computed<Map<string, string[]>>(() => {
    const deviceMap = new Map<string, Set<string>>();

    for (const entry of logEntries.value) {
        if (!deviceMap.has(entry.deviceId)) {
            deviceMap.set(entry.deviceId, new Set());
        }
        deviceMap.get(entry.deviceId)!.add(entry.signalName);
    }

    // Convert Sets to sorted arrays
    const result = new Map<string, string[]>();
    for (const [device, signals] of deviceMap) {
        result.set(device, Array.from(signals).sort());
    }
    return result;
});

// Helper functions for signal selection
export function addSignal(deviceId: string, signalName: string) {
    const key = `${deviceId}::${signalName}`;
    if (!selectedSignals.value.includes(key)) {
        selectedSignals.value = [...selectedSignals.value, key];
    }
}

export function removeSignal(deviceId: string, signalName: string) {
    const key = `${deviceId}::${signalName}`;
    selectedSignals.value = selectedSignals.value.filter(s => s !== key);
}

export function isSignalSelected(deviceId: string, signalName: string): boolean {
    return selectedSignals.value.includes(`${deviceId}::${signalName}`);
}

export function selectAllSignalsForDevice(deviceId: string) {
    const signals = availableSignals.value.get(deviceId) || [];
    const keysToAdd = signals.map(s => `${deviceId}::${s}`);
    const currentKeys = new Set(selectedSignals.value);
    keysToAdd.forEach(k => currentKeys.add(k));
    selectedSignals.value = Array.from(currentKeys);
}

export function deselectAllSignalsForDevice(deviceId: string) {
    const prefix = `${deviceId}::`;
    selectedSignals.value = selectedSignals.value.filter(s => !s.startsWith(prefix));
}

// UI State
export const isDragging = signal(false);
export const showSidebar = signal(true);

// Computed view properties
export const viewRange = computed<TimeRange | null>(() => {
    if (!currentSession.value || currentSession.value.startTime === undefined) {
        return null;
    }

    // Duration we can see in the viewport
    const viewportDuration = viewportWidth.value / zoomLevel.value;

    const range = {
        start: scrollOffset.value,
        end: scrollOffset.value + viewportDuration
    };
    return range;
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
 * Fetch entries for selected signals for the FULL session duration.
 * This is called once when signals change or session loads, not on scroll.
 */
// Full Data Fetching State
let hasFetchedForCurrentSignals = false;
let activeRequestId = 0;

/**
 * Fetch all entries for selected signals across the entire session
 */
export async function updateWaveformEntries() {
    const session = currentSession.value;
    if (!session || session.status !== 'complete' || selectedSignals.value.length === 0) return;
    if (session.startTime === undefined || session.endTime === undefined) return;

    // Only fetch once per signal set change
    if (hasFetchedForCurrentSignals) {
        return;
    }

    // Increment request ID to invalidate previous pending requests
    const requestId = ++activeRequestId;

    try {
        const sessionId = session.id;
        const start = session.startTime;
        const end = session.endTime;

        console.log(`[waveformStore] Fetching full session data: ${start} to ${end}`);

        // Fetch ALL entries for the session
        const entries = await getParseChunk(sessionId, start, end);

        // Race Condition Check: If a newer request started, ignore this result
        if (requestId !== activeRequestId) {
            console.log('Ignoring stale fetch response', requestId);
            return;
        }

        // Group by Signal Key
        const grouped: Record<string, LogEntry[]> = {};
        (entries as LogEntry[]).forEach((e: LogEntry) => {
            const key = `${e.deviceId}::${e.signalName}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        waveformEntries.value = grouped;
        hasFetchedForCurrentSignals = true;
        console.log(`[waveformStore] Loaded ${entries.length} entries for ${Object.keys(grouped).length} signals`);
    } catch (err) {
        console.error('Failed to fetch waveform entries', err);
    }
}

// Trigger update when session completes or selectedSignals changes
effect(() => {
    // Reset fetch flag when signals change
    const _signals = selectedSignals.value;
    hasFetchedForCurrentSignals = false;
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
    // The effect will automatically reset hasFetchedForCurrentSignals when selectedSignals changes
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
