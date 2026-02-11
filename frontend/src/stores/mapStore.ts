import { signal, computed, effect } from '@preact/signals';
import {
    getMapLayout, getMapRules, getRecentMapFiles, getCarrierLog, getCarrierEntries, setActiveMap,
    getDefaultMaps, loadDefaultMap, getValuesAtTime,
    type MapRules, type RecentMapFiles, type CarrierLogInfo, type CarrierEntry, type DefaultMapInfo
} from '../api/client';


export interface MapObject {
    name: string;
    type: string;
    text: string;
    size: string;
    location: string;
    unitId: string;
    lineThick: string;
    flowDirection: string;
    foreColor: string;
    endCap: string;
    startCap: string;
    dashStyle: string;
}

export interface MapLayout {
    version: string;
    objects: Record<string, MapObject>;
    id?: string;
    name?: string;
}

// State
export const mapLayout = signal<MapLayout | null>(null);
export const mapLoading = signal(false);
export const mapError = signal<string | null>(null);

export const mapZoom = signal(1.0);
export const mapOffset = signal({ x: 0, y: 0 });
export const selectedUnitId = signal<string | null>(null);

// Rules state
export const mapRules = signal<MapRules | null>(null);
export const rulesLoading = signal(false);
export const rulesError = signal<string | null>(null);

// Recent files state
export const recentMapFiles = signal<RecentMapFiles | null>(null);
export const recentFilesLoading = signal(false);

// Viewport state for centering
export const viewportSize = signal({ width: 0, height: 0 });

export const canEnableRules = computed(() => !!mapLayout.value && !!mapRules.value);

// Carrier log state
export const carrierLogInfo = signal<CarrierLogInfo | null>(null);
export const carrierLogEntries = signal<CarrierEntry[]>([]);
export const carrierLogLoading = signal(false);
export const carrierLogFileName = signal<string | null>(null);

// Signal log (PLC log) linkage state
export const signalLogSessionId = signal<string | null>(null);
export const signalLogFileName = signal<string | null>(null);
export const signalLogEntryCount = signal<number>(0);

// Map viewer determines server-side mode independently based on linked session's entry count.
// This decouples the map from the log viewer's current session state.
const MAP_SERVER_SIDE_THRESHOLD = 100000;
const mapUseServerSide = computed(() => signalLogEntryCount.value > MAP_SERVER_SIDE_THRESHOLD);

// Follow state
export const followedCarrierId = signal<string | null>(null);

// ======================
// Playback State
// ======================
export const playbackTime = signal<number | null>(null); // Unix timestamp ms
export const isPlaying = signal(false);
export const playbackSpeed = signal(1);
export const playbackStartTime = signal<number | null>(null); // Log start timestamp
export const playbackEndTime = signal<number | null>(null); // Log end timestamp

let playbackIntervalId: number | null = null;

// Actions
export async function fetchMapLayout() {
    mapLoading.value = true;
    mapError.value = null;
    try {
        const data = await getMapLayout();
        if (data?.objects) {
            const allObjs = Object.values(data.objects) as MapObject[];
            const withUnitId = allObjs.filter(o => o.unitId);
            console.log('[fetchMapLayout] Total objects:', allObjs.length,
                'with unitId:', withUnitId.length,
                'sample unitIds:', withUnitId.slice(0, 5).map(o => o.unitId));
        }
        mapLayout.value = data;
    } catch (err: unknown) {
        mapError.value = err instanceof Error ? err.message : 'Failed to fetch map layout';
    } finally {
        mapLoading.value = false;
    }
}

export async function fetchMapRules() {
    rulesLoading.value = true;
    rulesError.value = null;
    try {
        const data = await getMapRules();
        mapRules.value = data;
    } catch (err: unknown) {
        rulesError.value = err instanceof Error ? err.message : 'Failed to fetch rules';
    } finally {
        rulesLoading.value = false;
        clearCaches(); // New rules -> invalid cache
    }
}

export async function fetchRecentMapFiles() {
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

export async function loadMap(id: string) {
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

// Default maps state
export const defaultMaps = signal<DefaultMapInfo[]>([]);
export const defaultMapsLoading = signal(false);

export async function fetchDefaultMaps() {
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

export async function loadDefaultMapByName(name: string) {
    mapLoading.value = true;
    mapError.value = null;
    try {
        const layout = await loadDefaultMap(name);
        mapLayout.value = layout;
    } catch (err: unknown) {
        console.error('Failed to load default map:', err);
        mapError.value = err instanceof Error ? err.message : 'Failed to load default map';
    } finally {
        mapLoading.value = false;
    }
}


// Derived
export const mapObjectsArray = computed(() => {
    if (!mapLayout.value) return [];
    return Object.values(mapLayout.value.objects);
});

// ======================
// Carrier Tracking
// ======================

// Carrier tracking state
export const carrierTrackingEnabled = signal(false);
export const carrierLocations = signal<Map<string, string>>(new Map()); // carrierId -> unitId
export const latestSignalValues = signal<Map<string, any>>(new Map()); // deviceId::signalName -> value

// Signal history for time-based playback (key -> array of {timestamp, value})
// NOTE: For large files (server-side mode), this is NOT populated to save memory.
// Instead, getValuesAtTime API is used on-demand.
export const signalHistory = signal<Map<string, Array<{ timestamp: number, value: any }>>>(new Map());

// Centering and Viewport
export function centerOnUnit(unitId: string) {
    if (!mapLayout.value) return;
    const obj = mapLayout.value.objects[unitId];
    if (!obj || !obj.location) return;

    const [x, y] = obj.location.split(',').map(Number);
    if (isNaN(x) || isNaN(y)) return;

    // Center on (x, y) relative to viewport size
    const z = mapZoom.value;
    const w = viewportSize.value.width;
    const h = viewportSize.value.height;

    mapOffset.value = {
        x: w / 2 - x * z,
        y: h / 2 - y * z
    };
}

export function centerOnCarrier(carrierId: string) {
    const unitId = carrierLocations.value.get(carrierId);
    if (unitId) {
        centerOnUnit(unitId);
    }
}

// Effect: auto-center on followed carrier
effect(() => {
    const cid = followedCarrierId.value;
    if (!cid) return;

    const uid = carrierLocations.value.get(cid);
    if (uid) {
        centerOnUnit(uid);
    }
});

// Computed: count carriers at each unit
export const unitCarrierCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const unitId of carrierLocations.value.values()) {
        counts.set(unitId, (counts.get(unitId) || 0) + 1);
    }
    return counts;
});

// Computed: get carriers at a specific unit
export function getCarriersAtUnit(unitId: string): string[] {
    const carriers: string[] = [];
    for (const [carrierId, uid] of carrierLocations.value.entries()) {
        if (uid === unitId) {
            carriers.push(carrierId);
        }
    }
    return carriers;
}

// Cache for identifying relevant signals for a unit
// Map<UnitID, Map<SignalName, DeviceID>>
const unitSignalCache = new Map<string, Map<string, string>>();
const regexCache = new Map<string, RegExp>();

export function clearCaches() {
    unitSignalCache.clear();
    regexCache.clear();
}

/**
 * Maps a device ID to a unit ID using the current rules.
 * Supports exact matches and wildcards (e.g. "PLC_*").
 */
export function applyDeviceMapping(deviceId: string): string | null {
    if (mapRules.value?.deviceToUnit) {
        for (const mapping of mapRules.value.deviceToUnit) {
            const pattern = mapping.pattern;
            if (pattern.includes('*')) {
                // Use cached regex
                let regex = regexCache.get(pattern);
                if (!regex) {
                    regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    regexCache.set(pattern, regex);
                }

                if (regex.test(deviceId)) {
                    return mapping.unitId;
                }
            } else if (pattern === deviceId) {
                return mapping.unitId;
            }
        }
    }

    // 2. Fallback Heuristic: extract unit portion from device ID
    // Pattern: "...Belts.B1ACNV13301-102@B13" -> "B1ACNV13301-102"
    // Heuristic: Take the part between the last dot and the '@' symbol.
    let unitPortion = deviceId;

    // Extract part after last dot if present
    const lastDotIndex = deviceId.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        unitPortion = deviceId.substring(lastDotIndex + 1);
    }

    // Extract part before '@' if present
    const atIndex = unitPortion.indexOf('@');
    if (atIndex !== -1) {
        unitPortion = unitPortion.substring(0, atIndex);
    }

    return unitPortion;
}

/**
 * Returns the color and optional text label for a unit based on current state.
 * Uses playbackTime if set, otherwise uses latest values.
 */
export function getUnitColor(unitId: string): { color?: string, text?: string } {
    // 1. If carrier tracking is enabled, use carrier count coloring
    if (carrierTrackingEnabled.value) {
        const count = unitCarrierCounts.value.get(unitId) || 0;
        return { color: getCarrierCountColor(count) };
    }

    // 2. Otherwise, evaluate signal rules for this unit
    if (!mapRules.value?.rules || mapRules.value.rules.length === 0) {
        return { color: mapRules.value?.defaultColor || 'var(--bg-tertiary)' };
    }

    // Sort rules by priority (higher priority first)
    const sortedRules = [...mapRules.value.rules].sort((a, b) => b.priority - a.priority);

    // Evaluate rules
    // Check cache first
    let signalMap = unitSignalCache.get(unitId);
    if (!signalMap) {
        // Cache miss - compute and store
        signalMap = new Map<string, string>(); // SignalName -> DeviceID

        // Find which devices map to this unit and have signals we care about
        // We iterate ALL known signals once per unit (expensive, but only done once per unit)
        for (const key of latestSignalValues.value.keys()) {
            const [deviceId, signalName] = key.split('::');

            // Optimization: Only check if this signal is actually used in a rule
            const isRelevantSignal = sortedRules.some(r => r.signal === signalName);
            if (!isRelevantSignal) continue;

            const targetUnitId = applyDeviceMapping(deviceId);
            if (targetUnitId === unitId) {
                signalMap.set(signalName, deviceId); // Key: Name (e.g. I_BUFFER_STATUS), Value: DeviceID
            }
        }
        unitSignalCache.set(unitId, signalMap);

        // Detailed diagnostic on first cache build
        if (unitSignalCache.size === 1) {
            // Show all unique signal names in loaded data vs what rules need
            const allSignalNames = new Set<string>();
            const deviceIds = new Set<string>();
            for (const key of latestSignalValues.value.keys()) {
                const [did, sn] = key.split('::');
                allSignalNames.add(sn);
                deviceIds.add(did);
            }
            const ruleSignalNames = [...new Set(sortedRules.map(r => r.signal))];
            const matchingNames = ruleSignalNames.filter(s => allSignalNames.has(s));
            const missingNames = ruleSignalNames.filter(s => !allSignalNames.has(s));

            console.log('[getUnitColor] Signal data: %d values, %d devices, %d unique signals',
                latestSignalValues.value.size, deviceIds.size, allSignalNames.size);
            console.log('[getUnitColor] Devices in data:', [...deviceIds]);
            console.log('[getUnitColor] Signal names in data:', [...allSignalNames]);
            console.log('[getUnitColor] Rule signals needed:', ruleSignalNames,
                'Matching:', matchingNames, 'Missing:', missingNames);

            if (missingNames.length > 0) {
                console.warn('[getUnitColor] Rule signals NOT found in loaded data:', missingNames,
                    '— coloring will not work for these rules');
            }

            // Show which devices have rule-matching signals (these units WILL be colored)
            const colorableUnits: string[] = [];
            for (const key of latestSignalValues.value.keys()) {
                const [did, sn] = key.split('::');
                if (matchingNames.includes(sn)) {
                    const mapped = applyDeviceMapping(did);
                    if (mapped && !colorableUnits.includes(mapped)) {
                        colorableUnits.push(mapped);
                    }
                }
            }
            const totalWithUnitId = mapLayout.value
                ? Object.values(mapLayout.value.objects).filter(o => o.unitId).length
                : 0;
            console.log('[getUnitColor] Units that CAN be colored: %d out of %d map units:',
                colorableUnits.length, totalWithUnitId, colorableUnits);
        }
    }

    // Evaluate rules using cached mapping
    for (const rule of sortedRules) {
        // Look up the device ID for this rule's signal
        const deviceId = signalMap.get(rule.signal);
        if (!deviceId) continue; // This unit doesn't have this signal

        const key = `${deviceId}::${rule.signal}`;

        // Get value at playback time or latest
        const value = getSignalValueAtTime(key, playbackTime.value);
        if (value === undefined) continue;

        // Normalize values for comparison
        const normalizeValue = (v: any) => {
            if (v === null || v === undefined) return '';
            const s = String(v).trim().toLowerCase();
            if (s === 'on' || s === 'true' || s === '1') return 'true';
            if (s === 'off' || s === 'false' || s === '0') return 'false';
            return s;
        };

        const valNorm = normalizeValue(value);
        const ruleNorm = normalizeValue(rule.value);

        // Evaluate condition
        let match = false;
        switch (rule.op) {
            case '==': match = valNorm === ruleNorm; break;
            case '!=': match = valNorm !== ruleNorm; break;
            case '>': match = Number(value) > Number(rule.value); break;
            case '>=': match = Number(value) >= Number(rule.value); break;
            case '<': match = Number(value) < Number(rule.value); break;
            case '<=': match = Number(value) <= Number(rule.value); break;
        }

        if (match) {
            return {
                color: rule.color || rule.bgColor,
                text: rule.text
            };
        }
    }

    return { color: mapRules.value.defaultColor || 'var(--bg-tertiary)' };
}

/**
 * Get signal value at a specific time, or latest if time is null.
 * 
 * For large files (server-side mode), this uses the latest cached values
 * since the server-side API is called separately via effect.
 */
export function getSignalValueAtTime(key: string, time: number | null): any {
    // If no playback time, use latest value
    if (time === null) {
        return latestSignalValues.value.get(key);
    }

    // For server-side mode (large files), don't use history - rely on latest values
    // The separate effect fetches values at time from backend
    if (mapUseServerSide.value) {
        return latestSignalValues.value.get(key);
    }

    // Look up in history (client-side mode only)
    const history = signalHistory.value.get(key);
    if (!history || history.length === 0) {
        return latestSignalValues.value.get(key);
    }

    // Binary search for the value at or before the target time
    let result: any = undefined;
    for (const entry of history) {
        if (entry.timestamp <= time) {
            result = entry.value;
        } else {
            break; // History is sorted, no need to continue
        }
    }
    return result;
}

// Color utility based on carrier count
export function getCarrierCountColor(count: number): string {
    if (count === 0) return '#3a3a3a'; // Default gray
    if (count === 1) return '#90EE90'; // Light green
    if (count === 2) return '#FFD700'; // Yellow
    if (count === 3) return '#FFA500'; // Orange
    // 4+ carriers - red
    return '#FF4444';
}

// Get display text for carriers at a unit
export function getCarrierDisplayText(unitId: string): string | null {
    const carriers = getCarriersAtUnit(unitId);
    if (carriers.length === 0) return null;
    if (carriers.length === 1) {
        // Truncate from start if too long (show last 6 chars)
        const id = carriers[0];
        return id.length > 6 ? '...' + id.slice(-6) : id;
    }
    return `${carriers.length}x`;
}

// Bulk update signal values (with optional timestamps for history)
// NOTE: For large files (server-side mode), history is NOT populated to save memory.
export function updateSignalValues(entries: { deviceId: string, signalName: string, value: any, timestamp?: string | number }[]): void {
    const newValues = new Map(latestSignalValues.value);
    // Only update history for client-side mode (small files)
    const shouldUpdateHistory = !mapUseServerSide.value;
    const newHistory = shouldUpdateHistory ? new Map(signalHistory.value) : signalHistory.value;
    let changed = false;
    let newKeysAdded = false;

    for (const entry of entries) {
        const key = `${entry.deviceId}::${entry.signalName}`;

        // Track if this is a brand-new key (affects device-to-unit mapping cache)
        if (!newValues.has(key)) {
            newKeysAdded = true;
        }

        // Update latest value
        if (newValues.get(key) !== entry.value) {
            newValues.set(key, entry.value);
            changed = true;
        }

        // Add to history if timestamp is provided (client-side mode only)
        if (shouldUpdateHistory && entry.timestamp) {
            const ts = new Date(entry.timestamp).getTime();
            if (!isNaN(ts)) {
                const existing = newHistory.get(key) || [];
                // Append (assume entries come in order)
                existing.push({ timestamp: ts, value: entry.value });
                newHistory.set(key, existing);
            }
        }

        // Also handle carrier tracking if it's a CurrentLocation signal
        if (entry.signalName === 'CurrentLocation') {
            processLogEntryForCarrier(entry.deviceId, entry.signalName, entry.value);
        }
    }

    if (changed) {
        latestSignalValues.value = newValues;
        // Only invalidate device-to-unit mapping cache when new keys appear
        // (new device/signal combos may map to different units)
        if (newKeysAdded) {
            unitSignalCache.clear();
        }
    }
    signalHistory.value = newHistory;
}

// Process a log entry for carrier tracking
export function processLogEntryForCarrier(deviceId: string, signalName: string, value: unknown): void {
    if (signalName !== 'CurrentLocation') return;

    const carrierId = deviceId;
    const newUnitId = value ? String(value) : null;
    const oldUnitId = carrierLocations.value.get(carrierId);

    // Skip if no change
    if (oldUnitId === newUnitId) return;

    // Update the map (create new Map for reactivity)
    const newMap = new Map(carrierLocations.value);
    if (newUnitId) {
        newMap.set(carrierId, newUnitId);
    } else {
        newMap.delete(carrierId);
    }
    carrierLocations.value = newMap;
}

// Fetch carrier log info
export async function fetchCarrierLog(): Promise<void> {
    try {
        const info = await getCarrierLog();
        carrierLogInfo.value = info;
    } catch (err) {
        console.error('Failed to fetch carrier log info:', err);
    }
}

// Load carrier entries and populate carrier locations
export async function loadCarrierEntries(): Promise<void> {
    carrierLogLoading.value = true;
    try {
        const response = await getCarrierEntries();
        carrierLogEntries.value = response.entries || [];

        // Populate carrier locations from entries (use latest position for each carrier)
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

// Toggle carrier tracking
export async function toggleCarrierTracking(): Promise<void> {
    carrierTrackingEnabled.value = !carrierTrackingEnabled.value;

    if (carrierTrackingEnabled.value) {
        // Load carrier entries when enabled
        if (carrierLogInfo.value?.loaded) {
            await loadCarrierEntries();
        }
    } else {
        // Clear all carrier locations when disabled
        carrierLocations.value = new Map();
    }
}

/**
 * Link a log table session's entries to the map viewer for signal-based coloring.
 * This populates latestSignalValues, signalHistory, and sets the playback range.
 * 
 * For large files (server-side mode), also fetches initial signal state at start time.
 * 
 * @param sessionId - The session ID
 * @param sessionName - Display name for the session
 * @param entries - Log entries to populate signal values
 * @param startTime - Optional: Session start time from backend (Unix ms)
 * @param endTime - Optional: Session end time from backend (Unix ms)
 */
export async function linkSignalLogSession(
    sessionId: string,
    sessionName: string,
    entries: { deviceId: string; signalName: string; value: any; timestamp?: string | number }[],
    startTime?: number,
    endTime?: number,
    totalCount?: number
): Promise<void> {
    // Update linkage state
    signalLogSessionId.value = sessionId;
    signalLogFileName.value = sessionName;
    signalLogEntryCount.value = totalCount ?? entries.length;

    console.log('[linkSignalLogSession] sessionId:', sessionId, 'totalCount:', totalCount,
        'entries.length:', entries.length, 'entryCount set to:', signalLogEntryCount.value,
        'mapUseServerSide:', mapUseServerSide.value);

    // Clear caches as we have new data which might introduce new devices/signals
    clearCaches();

    // Push data to signal stores
    updateSignalValues(entries);

    // Determine time range
    let effectiveStartTime = startTime;
    let effectiveEndTime = endTime;

    // Fallback: compute time range from entries if not provided
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

    // Set playback range
    if (effectiveStartTime !== undefined && effectiveEndTime !== undefined) {
        setPlaybackRange(effectiveStartTime, effectiveEndTime);
    }

    // For large files (server-side mode), fetch initial signal state at start time
    // This ensures the map has current data even before playback starts
    if (mapUseServerSide.value && effectiveStartTime !== undefined) {
        try {
            const initialEntries = await getValuesAtTime(sessionId, Math.round(effectiveStartTime));
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
    const tickInterval = 100; // 100ms ticks
    playbackIntervalId = window.setInterval(() => {
        if (!isPlaying.value || playbackTime.value === null) return;
        const delta = tickInterval * playbackSpeed.value;
        const newTime = playbackTime.value + delta;
        if (playbackEndTime.value !== null && newTime >= playbackEndTime.value) {
            playbackTime.value = playbackEndTime.value;
            pause(); // Auto-pause at end
        } else {
            playbackTime.value = newTime;
        }
    }, tickInterval);
}

function stopPlaybackLoop(): void {
    if (playbackIntervalId !== null) {
        window.clearInterval(playbackIntervalId);
        playbackIntervalId = null;
    }
}

// Format playback time for display (use UTC to match log timestamps)
export function formatPlaybackTime(timeMs: number | null): string {
    if (timeMs === null) return '--:--:--';
    const date = new Date(timeMs);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}

// ======================
// Bidirectional Time Sync
// ======================

// Import sync function from bookmarkStore (avoiding circular deps by importing lazily)
let syncFromMapFn: ((time: number) => void) | null = null;
let isSyncEnabledFn: (() => boolean) | null = null;
let lastSyncedTime: number | null = null;

export function initMapSync(syncFromMap: (time: number) => void, isSyncEnabled: () => boolean): void {
    syncFromMapFn = syncFromMap;
    isSyncEnabledFn = isSyncEnabled;
}

// Effect: sync playbackTime changes to waveform
effect(() => {
    const time = playbackTime.value;
    if (time === null) return;
    if (!syncFromMapFn || !isSyncEnabledFn) return;
    const syncEnabled = isSyncEnabledFn ? isSyncEnabledFn() : false;
    if (!syncEnabled) return;
    if (time === lastSyncedTime) return; // Avoid echo

    lastSyncedTime = time;
    syncFromMapFn(time);
});

/**
 * SERVER-SIDE DATA FETCHING:
 * When a large log session is linked to the map, fetch signal state on-demand
 * for the current playback time. Decoupled from logStore's currentSession —
 * the map only needs signalLogSessionId and signalLogEntryCount.
 */
let isFetchingState = false;
let lastFetchCompleteTime = 0;

effect(() => {
    const time = playbackTime.value;
    const playing = isPlaying.value;
    const large = mapUseServerSide.value;
    const linkedSessionId = signalLogSessionId.value;

    // Debug: log which conditions are met/failing
    console.log('[MapEffect] time:', time, 'large:', large, 'linkedSessionId:', linkedSessionId,
        'entryCount:', signalLogEntryCount.value);

    if (!large || !time || !linkedSessionId) {
        console.log('[MapEffect] Skipping — large:', large, 'time:', !!time, 'linked:', !!linkedSessionId);
        return;
    }

    const now = Date.now();
    // Throttle: 500ms during playback, 50ms debounce when scrubbing for responsiveness
    const minInterval = playing ? 500 : 50;

    // If we are currently fetching or fetched too recently, wait for next time tick
    if (isFetchingState || (now - lastFetchCompleteTime < minInterval)) return;

    async function fetchValues() {
        if (isFetchingState) return;
        isFetchingState = true;
        try {
            // Build signal filter in deviceId::signalName format (what the backend expects)
            const rules = mapRules.value?.rules || [];
            const ruleSignalNames = new Set(rules.map(r => r.signal));
            if (carrierTrackingEnabled.value) ruleSignalNames.add('CurrentLocation');

            // Match rule signal names against known keys from latestSignalValues
            let signalsToFetch: string[] | undefined;
            if (ruleSignalNames.size > 0 && latestSignalValues.value.size > 0) {
                signalsToFetch = [...latestSignalValues.value.keys()].filter(key => {
                    const signalName = key.split('::')[1];
                    return ruleSignalNames.has(signalName);
                });
                // If no matches yet (first fetch), fetch everything
                if (signalsToFetch.length === 0) signalsToFetch = undefined;
            }

            const tsInt = Math.round(time!);
            console.log('[MapEffect] Fetching values at time:', tsInt, 'signals:', signalsToFetch?.length ?? 'all');
            const entries = await getValuesAtTime(linkedSessionId!, tsInt, signalsToFetch);

            const signalEntries = entries.map(e => ({
                deviceId: e.deviceId,
                signalName: e.signalName,
                value: e.value,
                timestamp: e.timestamp
            }));

            updateSignalValues(signalEntries);
        } catch (err) {
            console.error('Failed to fetch signal state for Map Viewer (server-side):', err);
        } finally {
            isFetchingState = false;
            lastFetchCompleteTime = Date.now();
        }
    }

    if (playing) {
        // During playback, trigger immediately if interval is met
        fetchValues();
    } else {
        // When scrubbing, use a small debounce
        const timer = setTimeout(fetchValues, minInterval);
        return () => clearTimeout(timer);
    }
});
