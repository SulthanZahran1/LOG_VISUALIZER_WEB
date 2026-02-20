/**
 * Waveform Store State
 * 
 * All signals and computed values for waveform functionality.
 */

import { signal, computed } from '@preact/signals';
import type { LogEntry, TimeRange, SignalType, FilterPreset, ChunkBoundaries } from './types';
import { currentSession, logEntries, useServerSide } from '../logStore';

// Re-export from selectionStore for convenience
export { selectedSignals, focusedSignal, isSignalSelected, toggleSignal } from '../selectionStore';
// Import for local use - renamed to avoid conflicts
export { selectedSignals as selSignals } from '../selectionStore';

// ======================
// Viewport State
// ======================
export const scrollOffset = signal(0);
export const zoomLevel = signal(1);
export const viewportWidth = signal(800);
export const hoverTime = signal<number | null>(null);
export const selectionRange = signal<{ start: number; end: number } | null>(null);

// ======================
// Waveform Data State
// ======================
export const waveformEntries = signal<Record<string, LogEntry[]>>({});
export const waveformBoundaries = signal<ChunkBoundaries>({ before: {}, after: {} });

// ======================
// Signal Lists
// ======================
export const allSignals = signal<string[]>([]);
export const allSignalTypes = signal<Map<string, SignalType>>(new Map());
export const showChangedInView = signal(false);
export const signalsWithChanges = signal<Set<string>>(new Set());

// ======================
// Filter State
// ======================
export const signalSearchQuery = signal('');
export const signalIsRegex = signal(false);
export const signalTypeFilter = signal<SignalType | 'all'>('all');

// ======================
// Presets State
// ======================
const PRESETS_KEY = 'waveform_filter_presets';

const loadPresets = (): FilterPreset[] => {
    try {
        const stored = localStorage.getItem(PRESETS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const filterPresets = signal<FilterPreset[]>(loadPresets());

// ======================
// UI State
// ======================
export const isDragging = signal(false);
export const showSidebar = signal(true);
export const isWaveformLoading = signal(false);
export const waveformLoadingProgress = signal(0);

// Hover state (using signals for reactive canvas rendering)
export const hoverX = signal<number | null>(null);
export const hoverRow = signal<number | null>(null);

// ======================
// Fetch Control State
// ======================
export let hasFetchedForCurrentSignals = false;
export let activeRequestId = 0;

export function resetFetchState(): void {
    hasFetchedForCurrentSignals = false;
    activeRequestId = 0;
}

export function incrementRequestId(): number {
    return ++activeRequestId;
}

export function setHasFetched(value: boolean): void {
    hasFetchedForCurrentSignals = value;
}

// ======================
// Session Tracking
// ======================
export let lastInitializedSessionId: string | null = null;

export function setLastInitializedSessionId(id: string | null): void {
    lastInitializedSessionId = id;
}

// ======================
// Computed Values
// ======================

export const availableSignals = computed<Map<string, string[]>>(() => {
    const deviceMap = new Map<string, Set<string>>();

    const signalsToUse = allSignals.value.length > 0
        ? allSignals.value
        : logEntries.value.map(e => `${e.deviceId}::${e.signalName}`);

    for (const signalKey of signalsToUse) {
        const [device, sig] = signalKey.split('::');
        if (!device || !sig) continue;

        if (!deviceMap.has(device)) {
            deviceMap.set(device, new Set());
        }
        deviceMap.get(device)!.add(sig);
    }

    const result = new Map<string, string[]>();
    for (const [device, signals] of deviceMap) {
        result.set(device, Array.from(signals).sort());
    }
    return result;
});

export const deviceColors = computed<Map<string, string>>(() => {
    const devices = Array.from(availableSignals.value.keys()).sort();
    const colors = [
        '#4DB6E2', // Primary Blue
        '#81C784', // Green
        '#FFB74D', // Orange
        '#E57373', // Red
        '#BA68C8', // Purple
        '#4DB6AC', // Teal
        '#FFF176', // Yellow
        '#A1887F'  // Brown
    ];

    const map = new Map<string, string>();
    devices.forEach((device, i) => {
        map.set(device, colors[i % colors.length]);
    });
    return map;
});

export const viewRange = computed<TimeRange | null>(() => {
    if (!currentSession.value || currentSession.value.startTime === undefined) {
        return null;
    }

    const viewportDuration = viewportWidth.value / zoomLevel.value;

    return {
        start: scrollOffset.value,
        end: scrollOffset.value + viewportDuration
    };
});

// Re-export session state for effects
export { currentSession, logEntries, useServerSide };
