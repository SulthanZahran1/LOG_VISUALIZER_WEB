/**
 * Waveform Store Actions
 * 
 * Action functions for waveform operations.
 */

import {
    getParseChunk, getChunkBoundaries
} from '../../api/client';
import type { LogEntry, FilterPreset, ChunkBoundaries } from './types';
import { clearSession } from '../logStore';
import {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    selectionRange,
    waveformEntries,
    waveformBoundaries,
    isWaveformLoading,
    waveformLoadingProgress,
    activeRequestId,
    incrementRequestId,
    setHasFetched,
    hasFetchedForCurrentSignals,
    useServerSide,
    currentSession,
    viewRange,
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    showChangedInView,
    filterPresets,
    selSignals as selectedSignals
} from './state';

// ======================
// Signal Selection
// ======================

import { selectedSignals as selectionStoreSignals } from '../selectionStore';

export function addSignal(deviceId: string, signalName: string): void {
    const key = `${deviceId}::${signalName}`;
    if (!selectionStoreSignals.value.includes(key)) {
        selectionStoreSignals.value = [...selectionStoreSignals.value, key];
    }
}

export function removeSignal(deviceId: string, signalName: string): void {
    const key = `${deviceId}::${signalName}`;
    selectionStoreSignals.value = selectionStoreSignals.value.filter((s: string) => s !== key);
}

import { availableSignals } from './state';

export function selectAllSignalsForDevice(deviceId: string): void {
    const signals = availableSignals.value.get(deviceId) || [];
    const keysToAdd = signals.map((s: string) => `${deviceId}::${s}`);
    const currentKeys = new Set(selectedSignals.value);
    keysToAdd.forEach((k: string) => currentKeys.add(k));
    selectedSignals.value = Array.from(currentKeys);
}

export function deselectAllSignalsForDevice(deviceId: string): void {
    const prefix = `${deviceId}::`;
    selectionStoreSignals.value = selectionStoreSignals.value.filter((s: string) => !s.startsWith(prefix));
}

// ======================
// Viewport Navigation
// ======================

export function getViewportDuration(): number {
    return viewportWidth.value / zoomLevel.value;
}

export function zoomAt(delta: number, x: number): void {
    const currentRange = viewRange.value;
    if (!currentRange) return;

    const mouseTime = currentRange.start + (x / zoomLevel.value);
    const factor = delta > 0 ? 0.9 : 1.1;
    const newZoom = zoomLevel.value * factor;

    // Clamp zoom (1ms per pixel to 1 hour per pixel)
    if (newZoom < 0.000001 || newZoom > 1000) return;

    const newScrollOffset = mouseTime - (x / newZoom);
    zoomLevel.value = newZoom;
    scrollOffset.value = newScrollOffset;
}

export function pan(deltaX: number): void {
    const timeDelta = deltaX / zoomLevel.value;
    scrollOffset.value -= timeDelta;

    // Soft clamp to session bounds
    const session = currentSession.value;
    if (session && session.startTime !== undefined && session.endTime !== undefined) {
        const margin = (session.endTime - session.startTime) * 0.1;
        if (scrollOffset.value < session.startTime - margin) {
            scrollOffset.value = session.startTime - margin;
        }
        if (scrollOffset.value > session.endTime + margin) {
            scrollOffset.value = session.endTime + margin;
        }
    }
}

export function jumpToTime(timeMs: number): void {
    const session = currentSession.value;
    if (!session || session.startTime === undefined || session.endTime === undefined) return;

    const viewportMs = getViewportDuration();
    const newOffset = timeMs - (viewportMs / 2);

    const minOffset = session.startTime;
    const maxOffset = session.endTime - viewportMs;
    scrollOffset.value = Math.max(minOffset, Math.min(newOffset, Math.max(minOffset, maxOffset)));
}

export function clearSelection(): void {
    selectionRange.value = null;
}

export function zoomToSelection(): void {
    const range = selectionRange.value;
    if (!range) return;

    const duration = Math.abs(range.end - range.start);
    if (duration <= 0) return;

    const newZoom = viewportWidth.value / duration;
    const clampedZoom = Math.max(0.0001, Math.min(100, newZoom));

    zoomLevel.value = clampedZoom;
    scrollOffset.value = Math.min(range.start, range.end);
    selectionRange.value = null;
}

// ======================
// Waveform Data Fetching
// ======================

export function cancelWaveformLoading(): void {
    incrementRequestId();
    isWaveformLoading.value = false;
    waveformLoadingProgress.value = 0;
}

export async function updateWaveformEntries(): Promise<void> {
    const session = currentSession.value;
    if (!session || session.status !== 'complete' || selectedSignals.value.length === 0) return;
    if (session.startTime === undefined || session.endTime === undefined) return;

    const isLarge = useServerSide.value;
    const range = isLarge ? viewRange.value : { start: session.startTime, end: session.endTime };

    if (!range) return;

    // Only fetch FULL session once for small files
    if (!isLarge && hasFetchedForCurrentSignals) {
        return;
    }

    const requestId = incrementRequestId();
    isWaveformLoading.value = true;
    waveformLoadingProgress.value = 0;

    try {
        const sessionId = session.id;
        const start = range.start;
        const end = range.end;
        const signals = selectedSignals.value;

        const [entries, boundaries] = await Promise.all([
            getParseChunk(sessionId, start, end, signals),
            isLarge ? getChunkBoundaries(sessionId, start, end, signals) : Promise.resolve({ before: {}, after: {} })
        ]) as [LogEntry[], ChunkBoundaries];

        if (requestId !== activeRequestId) return;

        const grouped: Record<string, LogEntry[]> = {};
        entries.forEach((e: LogEntry) => {
            const key = `${e.deviceId}::${e.signalName}`;
            const isSelected = signals.includes(key);
            if (!isSelected) return;

            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        waveformEntries.value = grouped;

        if (isLarge) {
            waveformBoundaries.value = boundaries;
        } else {
            waveformBoundaries.value = { before: {}, after: {} };
        }

        if (!isLarge) {
            setHasFetched(true);
        }
    } catch (err: any) {
        if (err.status === 404) {
            console.warn('Session not found on server during updateWaveformEntries, clearing local state');
            clearSession();
        } else {
            console.error('Failed to fetch waveform entries', err);
        }
    } finally {
        if (requestId === activeRequestId) {
            isWaveformLoading.value = false;
            waveformLoadingProgress.value = 100;
        }
    }
}

// ======================
// Preset Management
// ======================

const PRESETS_KEY = 'waveform_filter_presets';

export function savePreset(name: string): void {
    const newPreset: FilterPreset = {
        name,
        searchQuery: signalSearchQuery.value,
        isRegex: signalIsRegex.value,
        typeFilter: signalTypeFilter.value,
        showChangedInView: showChangedInView.value
    };
    filterPresets.value = [...filterPresets.value.filter(p => p.name !== name), newPreset];
    persistPresets();
}

export function loadPreset(preset: FilterPreset): void {
    signalSearchQuery.value = preset.searchQuery;
    signalIsRegex.value = preset.isRegex;
    signalTypeFilter.value = preset.typeFilter;
    showChangedInView.value = preset.showChangedInView;
}

export function deletePreset(name: string): void {
    filterPresets.value = filterPresets.value.filter(p => p.name !== name);
    persistPresets();
}

function persistPresets(): void {
    try {
        window.localStorage.setItem(PRESETS_KEY, JSON.stringify(filterPresets.value));
    } catch {
        // Ignore localStorage errors
    }
}

// ======================
// Signal Data Refresh
// ======================

export function refreshSignalData(): void {
    setHasFetched(false);
    updateWaveformEntries();
}
