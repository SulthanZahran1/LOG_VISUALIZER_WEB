/**
 * Map Store Actions
 * 
 * Async action functions for map operations.
 */

import {
    getMapLayout, getMapRules, getRecentMapFiles, getCarrierLog, getCarrierEntries,
    setActiveMap, getDefaultMaps, loadDefaultMap, getValuesAtTime
} from '../../api/client';
import {
    mapLayout, mapLoading, mapError,
    mapRules, rulesLoading, rulesError,
    recentMapFiles, recentFilesLoading,
    defaultMaps, defaultMapsLoading,
    carrierLogInfo, carrierLogEntries, carrierLogLoading,
    signalLogSessionId, signalLogFileName, signalLogEntryCount,
    carrierLocations, carrierTrackingEnabled,
    playbackTime, isPlaying, playbackStartTime, playbackEndTime,
    playbackSpeed,
    setPlaybackIntervalId, playbackIntervalId,
    clearCaches,
    signalHistory, latestSignalValues, mapUseServerSide
} from './state';
import type { MapObject, MapLayout } from './types';


// ======================
// Layout Actions
// ======================

export async function fetchMapLayout(): Promise<void> {
    mapLoading.value = true;
    mapError.value = null;
    try {
        const data = await getMapLayout();
        // The API may return layout directly or wrapped in a 'layout' field
        const layoutData = data.layout ?? data;
        if (layoutData?.objects) {
            const allObjs = Object.values(layoutData.objects);
            const withUnitId = allObjs.filter((o: MapObject) => o.unitId);
            void withUnitId; // Used for debug logging
            //     'with unitId:', withUnitId.length,
            //     'sample unitIds:', withUnitId.slice(0, 5).map((o: MapObject) => o.unitId));
        }
        mapLayout.value = layoutData as MapLayout;
    } catch (err: unknown) {
        mapError.value = err instanceof Error ? err.message : 'Failed to fetch map layout';
    } finally {
        mapLoading.value = false;
    }
}

export async function fetchMapRules(): Promise<void> {
    rulesLoading.value = true;
    rulesError.value = null;
    try {
        const data = await getMapRules();
        mapRules.value = data;
    } catch (err: unknown) {
        rulesError.value = err instanceof Error ? err.message : 'Failed to fetch rules';
    } finally {
        rulesLoading.value = false;
        clearCaches();
    }
}

export async function fetchRecentMapFiles(): Promise<void> {
    recentFilesLoading.value = true;
    try {
        const data = await getRecentMapFiles();
        recentMapFiles.value = data;
    } catch (err: unknown) {
        console.error('Failed to fetch recent map files:', err);
    } finally {
        recentFilesLoading.value = false;
    }
}

export async function loadMap(id: string): Promise<void> {
    try {
        mapLoading.value = true;
        await setActiveMap(id);
        await fetchMapLayout();
    } catch (err: unknown) {
        console.error('Failed to load map:', err);
        mapError.value = err instanceof Error ? err.message : 'Failed to load map';
    } finally {
        mapLoading.value = false;
    }
}

// ======================
// Default Maps Actions
// ======================

export async function fetchDefaultMaps(): Promise<void> {
    defaultMapsLoading.value = true;
    try {
        const data = await getDefaultMaps();
        defaultMaps.value = data.maps || [];
    } catch (err: unknown) {
        console.error('Failed to fetch default maps:', err);
        defaultMaps.value = [];
    } finally {
        defaultMapsLoading.value = false;
    }
}

export async function loadDefaultMapByName(name: string): Promise<void> {
    mapLoading.value = true;
    mapError.value = null;
    try {
        const response = await loadDefaultMap(name);
        if (response.mapId) {
            await fetchMapLayout();
        }
    } catch (err: unknown) {
        console.error('Failed to load default map:', err);
        mapError.value = err instanceof Error ? err.message : 'Failed to load default map';
    } finally {
        mapLoading.value = false;
    }
}

// ======================
// Carrier Log Actions
// ======================

export async function fetchCarrierLog(): Promise<void> {
    try {
        const info = await getCarrierLog();
        carrierLogInfo.value = info;
    } catch (err) {
        console.error('Failed to fetch carrier log info:', err);
    }
}

export async function loadCarrierEntries(): Promise<void> {
    carrierLogLoading.value = true;
    try {
        const response = await getCarrierEntries();
        carrierLogEntries.value = response.entries || [];

        // Populate carrier locations from entries
        const newLocations = new Map<string, string>();
        for (const entry of carrierLogEntries.value) {
            newLocations.set(entry.carrierId, entry.unitId);
        }
        carrierLocations.value = newLocations;
    } catch (err) {
        console.error('Failed to load carrier entries:', err);
    } finally {
        carrierLogLoading.value = false;
    }
}

export async function toggleCarrierTracking(): Promise<void> {
    carrierTrackingEnabled.value = !carrierTrackingEnabled.value;

    if (carrierTrackingEnabled.value) {
        if (carrierLogInfo.value?.loaded) {
            await loadCarrierEntries();
        }
    } else {
        carrierLocations.value = new Map();
    }
}

// ======================
// Signal Log Linkage
// ======================

export interface SignalLogEntry {
    deviceId: string;
    signalName: string;
    value: boolean | string | number;
    timestamp?: string | number;
}

export async function linkSignalLogSession(
    sessionId: string,
    sessionName: string,
    entries: SignalLogEntry[],
    startTime?: number,
    endTime?: number,
    totalCount?: number
): Promise<void> {
    signalLogSessionId.value = sessionId;
    signalLogFileName.value = sessionName;
    signalLogEntryCount.value = totalCount ?? entries.length;

    //     'entries.length:', entries.length, 'entryCount set to:', signalLogEntryCount.value,
    //     'mapUseServerSide:', mapUseServerSide.value);

    clearCaches();
    updateSignalValues(entries);

    // Determine time range
    let effectiveStartTime = startTime;
    let effectiveEndTime = endTime;

    if ((effectiveStartTime === undefined || effectiveEndTime === undefined) && entries.length > 0) {
        const timestamps = entries
            .map(e => {
                if (e.timestamp === undefined || e.timestamp === null) return null;
                if (typeof e.timestamp === 'number') return e.timestamp;
                const parsed = new Date(e.timestamp).getTime();
                return isNaN(parsed) ? null : parsed;
            })
            .filter((t): t is number => t !== null);
        if (timestamps.length > 0) {
            effectiveStartTime = Math.min(...timestamps);
            effectiveEndTime = Math.max(...timestamps);
        }
    }

    if (effectiveStartTime !== undefined && effectiveEndTime !== undefined) {
        setPlaybackRange(effectiveStartTime, effectiveEndTime);
    }

    // For large files (server-side mode), fetch initial signal state at start time
    if (mapUseServerSide.value && effectiveStartTime !== undefined) {
        try {
            const rules = mapRules.value?.rules || [];
            const ruleSignalNames = [...new Set(rules.map(r => r.signal))];
            const signalFilter = ruleSignalNames.length > 0 ? ruleSignalNames : undefined;
            const initialEntries = await getValuesAtTime(sessionId, Math.round(effectiveStartTime), signalFilter);
            if (!Array.isArray(initialEntries)) {
                console.warn('getValuesAtTime returned non-array value:', initialEntries);
                return;
            }
            const signalEntries = initialEntries.map(e => ({
                deviceId: e.deviceId,
                signalName: e.signalName,
                value: e.value,
                timestamp: e.timestamp
            }));
            updateSignalValues(signalEntries);
        } catch (err) {
            console.error('Failed to fetch initial signal state for Map Viewer:', err);
        }
    }
}

// ======================
// Signal Value Management
// ======================

export function updateSignalValues(entries: SignalLogEntry[]): void {
    const newValues = new Map(latestSignalValues.value);
    const shouldUpdateHistory = !mapUseServerSide.value;
    const newHistory = shouldUpdateHistory ? new Map(signalHistory.value) : signalHistory.value;
    let changed = false;
    let newKeysAdded = false;

    for (const entry of entries) {
        const key = `${entry.deviceId}::${entry.signalName}`;

        if (!newValues.has(key)) {
            newKeysAdded = true;
        }

        if (newValues.get(key) !== entry.value) {
            newValues.set(key, entry.value);
            changed = true;
        }

        if (shouldUpdateHistory && entry.timestamp) {
            const ts = new Date(entry.timestamp).getTime();
            if (!isNaN(ts)) {
                const existing = newHistory.get(key) || [];
                existing.push({ timestamp: ts, value: entry.value });
                newHistory.set(key, existing);
            }
        }

        // Handle carrier tracking if it's a CurrentLocation signal
        if (entry.signalName === 'CurrentLocation') {
            processLogEntryForCarrier(entry.deviceId, entry.signalName, entry.value);
        }
    }

    if (changed) {
        latestSignalValues.value = newValues;
        if (newKeysAdded) {
            clearCaches();
        }
    }
    signalHistory.value = newHistory;
}

export function processLogEntryForCarrier(deviceId: string, signalName: string, value: unknown): void {
    if (signalName !== 'CurrentLocation') return;

    const carrierId = deviceId;
    const newUnitId = value ? String(value) : null;
    const oldUnitId = carrierLocations.value.get(carrierId);

    if (oldUnitId === newUnitId) return;

    const newMap = new Map(carrierLocations.value);
    if (newUnitId) {
        newMap.set(carrierId, newUnitId);
    } else {
        newMap.delete(carrierId);
    }
    carrierLocations.value = newMap;
}

// ======================
// Playback Controls
// ======================

export function play(): void {
    if (isPlaying.value) return;
    if (playbackTime.value === null && playbackStartTime.value !== null) {
        playbackTime.value = playbackStartTime.value;
    }
    isPlaying.value = true;
    startPlaybackLoop();
}

export function pause(): void {
    isPlaying.value = false;
    stopPlaybackLoop();
}

export function togglePlayback(): void {
    if (isPlaying.value) {
        pause();
    } else {
        play();
    }
}

export function skipForward(seconds: number = 10): void {
    if (playbackTime.value === null) return;
    const newTime = playbackTime.value + seconds * 1000;
    if (playbackEndTime.value !== null && newTime > playbackEndTime.value) {
        playbackTime.value = playbackEndTime.value;
    } else {
        playbackTime.value = newTime;
    }
}

export function skipBackward(seconds: number = 10): void {
    if (playbackTime.value === null) return;
    const newTime = playbackTime.value - seconds * 1000;
    if (playbackStartTime.value !== null && newTime < playbackStartTime.value) {
        playbackTime.value = playbackStartTime.value;
    } else {
        playbackTime.value = newTime;
    }
}

export function setPlaybackTime(time: number): void {
    playbackTime.value = time;
}

export function setPlaybackSpeed(speed: number): void {
    playbackSpeed.value = speed;
}

export function setPlaybackRange(startTime: number, endTime: number): void {
    playbackStartTime.value = startTime;
    playbackEndTime.value = endTime;
    if (playbackTime.value === null) {
        playbackTime.value = startTime;
    }
}

function startPlaybackLoop(): void {
    if (playbackIntervalId !== null) return;
    const tickInterval = 100;
    const id = window.setInterval(() => {
        if (!isPlaying.value || playbackTime.value === null) return;
        const speed = playbackSpeed.value;
        const delta = tickInterval * speed;
        const newTime = playbackTime.value + delta;
        if (playbackEndTime.value !== null && newTime >= playbackEndTime.value) {
            playbackTime.value = playbackEndTime.value;
            pause();
        } else {
            playbackTime.value = newTime;
        }
    }, tickInterval);
    setPlaybackIntervalId(id);
}

function stopPlaybackLoop(): void {
    if (playbackIntervalId !== null) {
        window.clearInterval(playbackIntervalId);
        setPlaybackIntervalId(null);
    }
}

// ======================
// Time Sync
// ======================

let syncFromMapFn: ((time: number) => void) | null = null;
let isSyncEnabledFn: (() => boolean) | null = null;

export function initMapSync(syncFromMap: (time: number) => void, isSyncEnabled: () => boolean): void {
    syncFromMapFn = syncFromMap;
    isSyncEnabledFn = isSyncEnabled;
}

export function getSyncFunctions() {
    return { syncFromMapFn, isSyncEnabledFn };
}
