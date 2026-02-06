import { signal, computed, effect } from '@preact/signals';
import { getParseChunk, getParseSignals, getChunkBoundaries, type ChunkBoundaries } from '../api/client';
import { currentSession, logEntries, clearSession, useServerSide } from './logStore';
import { selectedSignals, focusedSignal, isSignalSelected, toggleSignal } from './selectionStore';
import type { LogEntry, TimeRange, SignalType } from '../models/types';

// Re-export for convenience if needed, but components should import from selectionStore
export { selectedSignals, focusedSignal, isSignalSelected, toggleSignal };

// Viewport State
export const scrollOffset = signal(0); // start timestamp in ms
export const zoomLevel = signal(1); // pixels per millisecond
export const viewportWidth = signal(800); // Updated by resize observer
export const hoverTime = signal<number | null>(null);
export const selectionRange = signal<{ start: number, end: number } | null>(null);

// Signal Selection - State moved to selectionStore.ts to fix circular dependency
export const waveformEntries = signal<Record<string, LogEntry[]>>({});

// Boundary values for proper waveform rendering (last value before view, first value after)
export const waveformBoundaries = signal<ChunkBoundaries>({ before: {}, after: {} });

// Full signal list from backend
export const allSignals = signal<string[]>([]);
export const showChangedInView = signal(false);
export const signalsWithChanges = signal<Set<string>>(new Set());

// Centralized Filter State
export const signalSearchQuery = signal('');
export const signalIsRegex = signal(false);
export const signalTypeFilter = signal<SignalType | 'all'>('all');

export interface FilterPreset {
    name: string;
    searchQuery: string;
    isRegex: boolean;
    typeFilter: SignalType | 'all';
    showChangedInView: boolean;
}

// Presets persisted in localStorage
const PRESETS_KEY = 'waveform_filter_presets';
const loadPresets = (): FilterPreset[] => {
    try {
        const stored = window.localStorage.getItem(PRESETS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const filterPresets = signal<FilterPreset[]>(loadPresets());

effect(() => {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(filterPresets.value));
});

// Available Signals - computed from allSignals (fallback to logEntries)
export const availableSignals = computed<Map<string, string[]>>(() => {
    const deviceMap = new Map<string, Set<string>>();

    const signalsToUse = allSignals.value.length > 0
        ? allSignals.value
        : logEntries.value.map(e => `${e.deviceId}::${e.signalName}`);

    for (const signalKey of signalsToUse) {
        const [device, signal] = signalKey.split('::');
        if (!device || !signal) continue;

        if (!deviceMap.has(device)) {
            deviceMap.set(device, new Set());
        }
        deviceMap.get(device)!.add(signal);
    }

    // Convert Sets to sorted arrays
    const result = new Map<string, string[]>();
    for (const [device, signals] of deviceMap) {
        result.set(device, Array.from(signals).sort());
    }
    return result;
});

// Device Colors - computed from availableSignals
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

// isSignalSelected is imported/exported from selectionStore

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
export const isWaveformLoading = signal(false);
export const waveformLoadingProgress = signal(0); // 0-100 for progressive loading

// Hover state (using signals for reactive canvas rendering)
export const hoverX = signal<number | null>(null);
export const hoverRow = signal<number | null>(null);

export function getViewportDuration(): number {
    return viewportWidth.value / zoomLevel.value;
}

// Computed view properties
export const viewRange = computed<TimeRange | null>(() => {
    if (!currentSession.value || currentSession.value.startTime === undefined) {
        return null;
    }

    // Duration we can see in the viewport
    const viewportDuration = getViewportDuration();

    const range = {
        start: scrollOffset.value,
        end: scrollOffset.value + viewportDuration
    };
    return range;
});

// Track the last session ID to detect when a new session starts
let lastInitializedSessionId: string | null = null;

/**
 * Initialize view range from session info
 * Resets scrollOffset and zoom when a NEW session is loaded
 */
effect(() => {
    const session = currentSession.value;
    if (session && session.status === 'complete' && session.startTime !== undefined) {
        // Reset if this is a NEW session (different ID) or if scrollOffset is at default (0)
        if (session.id !== lastInitializedSessionId) {
            lastInitializedSessionId = session.id;
            scrollOffset.value = session.startTime;

            // Set initial zoom to fit roughly 10 seconds or the whole thing if shorter
            const sessionDuration = session.endTime! - session.startTime;
            const targetDuration = Math.min(sessionDuration, 10000) || 1000;
            zoomLevel.value = viewportWidth.value / targetDuration;
        }
    } else if (!session) {
        // Clear the tracked session ID when session is cleared
        lastInitializedSessionId = null;
    }
});

/**
 * Fetch all signals for the session once it's complete
 */
effect(() => {
    const session = currentSession.value;
    if (session && session.status === 'complete' && allSignals.value.length === 0) {
        getParseSignals(session.id).then(signals => {
            allSignals.value = signals;
            // Default to selecting ALL signals if none selected
            if (selectedSignals.value.length === 0) {
                selectedSignals.value = signals;
            }
        }).catch(err => {
            if (err.status === 404) {
                console.warn('Session not found on server during getParseSignals, clearing local state');
                clearSession();
            } else {
                console.error('Failed to fetch signals', err);
            }
        });
    } else if (!session) {
        allSignals.value = [];
    }
});

/**
 * Fetch entries for the current viewport to identify signals with changes
 */
effect(() => {
    const session = currentSession.value;
    const range = viewRange.value;
    const active = showChangedInView.value;

    if (!session || !range || !active) {
        signalsWithChanges.value = new Set();
        return;
    }

    // LARGE FILE OPTIMIZATION: Only fetch chunk if we are actually viewing a segment
    // We pass empty signals list to GetChunk to indicate we want "everything" in that window for identifying changes
    getParseChunk(session.id, range.start, range.end).then(chunk => {
        const changed = new Set<string>();
        for (const e of chunk) {
            changed.add(`${e.deviceId}::${e.signalName}`);
        }
        signalsWithChanges.value = changed;
    }).catch(err => {
        if (err.status === 404) {
            console.warn('Session not found on server during chunk fetch, clearing local state');
            clearSession();
        } else {
            console.error('Failed to fetch chunk for changed signals', err);
        }
    });
});

/**
 * Fetch entries for selected signals for the FULL session duration.
 * This is called once when signals change or session loads, not on scroll.
 */
// Full Data Fetching State
let hasFetchedForCurrentSignals = false;
let activeRequestId = 0;

/**
 * Fetch entries for selected signals.
 * LARGE FILE OPTIMIZATION: 
 * - If in server-side mode, fetch ONLY for the current viewport (viewRange).
 * - If small file, fetch FULL session duration once.
 */
export async function updateWaveformEntries() {
    const session = currentSession.value;
    if (!session || session.status !== 'complete' || selectedSignals.value.length === 0) return;
    if (session.startTime === undefined || session.endTime === undefined) return;

    // Use centralized server-side flag
    const isLarge = useServerSide.value;
    const range = isLarge ? viewRange.value : { start: session.startTime, end: session.endTime };

    if (!range) return;

    // Only fetch FULL session once for small files
    if (!isLarge && hasFetchedForCurrentSignals) {
        return;
    }

    // Increment request ID to invalidate previous pending requests
    const requestId = ++activeRequestId;

    // Set loading state
    isWaveformLoading.value = true;
    waveformLoadingProgress.value = 0;

    try {
        const sessionId = session.id;
        const start = range.start;
        const end = range.end;
        const signals = selectedSignals.value;

        // Fetch entries and boundaries in parallel for server-side mode
        const fetchPromises: [Promise<any>, Promise<ChunkBoundaries> | null] = [
            getParseChunk(sessionId, start, end, signals),
            isLarge ? getChunkBoundaries(sessionId, start, end, signals) : null
        ];

        const [entries, boundaries] = await Promise.all([
            fetchPromises[0],
            fetchPromises[1] ?? Promise.resolve({ before: {}, after: {} })
        ]);

        // Race Condition Check: If a newer request started, ignore this result
        if (requestId !== activeRequestId) {
            return;
        }

        // Group by Signal Key
        const grouped: Record<string, LogEntry[]> = {};
        (entries as LogEntry[]).forEach((e: LogEntry) => {
            const key = `${e.deviceId}::${e.signalName}`;
            // If in large mode, we only want entries for SELECTED signals
            // (The backend chunk API returns everything in that window, so we filter locally as well for safety)
            const isSelected = signals.includes(key);
            if (!isSelected) return;

            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        // In large mode, we replace waveformEntries entirely for the viewport
        // In small mode, we still set it once
        waveformEntries.value = grouped;

        // Update boundaries (used for proper edge rendering in server-side mode)
        if (isLarge) {
            waveformBoundaries.value = boundaries;
        } else {
            // For small files, we have all data so no boundary tracking needed
            waveformBoundaries.value = { before: {}, after: {} };
        }

        if (!isLarge) {
            hasFetchedForCurrentSignals = true;
        }
    } catch (err: any) {
        if (err.status === 404) {
            console.warn('Session not found on server during updateWaveformEntries, clearing local state');
            clearSession();
        } else {
            console.error('Failed to fetch waveform entries', err);
        }
    } finally {
        // Only clear loading if this is still the active request
        if (requestId === activeRequestId) {
            isWaveformLoading.value = false;
            waveformLoadingProgress.value = 100;
        }
    }
}

// Trigger update when session completes or selectedSignals changes
effect(() => {
    // Access signals to create dependencies
    selectedSignals.value;
    const session = currentSession.value;
    const isLarge = (session?.entryCount ?? 0) > 100000;

    if (isLarge) {
        // Track viewport range changes in large mode
        viewRange.value;
    }

    // Reset fetch flag when signals change for small files
    hasFetchedForCurrentSignals = false;

    // Debounce: 150ms for large files (scrolling/zooming), immediate for small files
    // This prevents excessive API calls during rapid interactions
    const timer = setTimeout(() => {
        updateWaveformEntries();
    }, isLarge ? 150 : 0);

    return () => clearTimeout(timer);
});

// toggleSignal is imported/exported from selectionStore

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

/**
 * Jump to a specific time (in ms), clamped to session bounds
 */
export function jumpToTime(timeMs: number) {
    const session = currentSession.value;
    if (!session || session.startTime === undefined || session.endTime === undefined) return;

    // Center the time in the viewport if possible
    const viewportMs = getViewportDuration();
    const newOffset = timeMs - (viewportMs / 2);

    // Clamp to session bounds
    const minOffset = session.startTime;
    const maxOffset = session.endTime - viewportMs;
    scrollOffset.value = Math.max(minOffset, Math.min(newOffset, Math.max(minOffset, maxOffset)));
}

export function clearSelection() {
    selectionRange.value = null;
}

export function zoomToSelection() {
    const range = selectionRange.value;
    if (!range) return;

    const duration = Math.abs(range.end - range.start);
    if (duration <= 0) return;

    // newZoom = viewportWidth / duration
    const newZoom = viewportWidth.value / duration;

    // Limit zoom level to reasonable bounds
    const clampedZoom = Math.max(0.0001, Math.min(100, newZoom));

    zoomLevel.value = clampedZoom;
    scrollOffset.value = Math.min(range.start, range.end);
    selectionRange.value = null; // Clear selection after zoom
}

// Preset Management
export function savePreset(name: string) {
    const newPreset: FilterPreset = {
        name,
        searchQuery: signalSearchQuery.value,
        isRegex: signalIsRegex.value,
        typeFilter: signalTypeFilter.value,
        showChangedInView: showChangedInView.value
    };
    filterPresets.value = [...filterPresets.value.filter(p => p.name !== name), newPreset];
}

export function loadPreset(preset: FilterPreset) {
    signalSearchQuery.value = preset.searchQuery;
    signalIsRegex.value = preset.isRegex;
    signalTypeFilter.value = preset.typeFilter;
    showChangedInView.value = preset.showChangedInView;
}

export function deletePreset(name: string) {
    filterPresets.value = filterPresets.value.filter(p => p.name !== name);
}

// Debugging - extend window interface for dev tools
declare global {
    interface Window {
        waveformStore?: typeof waveformStoreDebug;
    }
}

const waveformStoreDebug = {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    selectedSignals,
    waveformEntries,
    viewRange,
    selectionRange
};

if (typeof window !== 'undefined') {
    window.waveformStore = waveformStoreDebug;
}
