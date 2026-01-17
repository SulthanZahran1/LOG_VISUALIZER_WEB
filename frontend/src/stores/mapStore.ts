import { signal, computed } from '@preact/signals';
import {
    getMapLayout, getMapRules, getRecentMapFiles, getCarrierLog, getCarrierEntries,
    type MapRules, type RecentMapFiles, type CarrierLogInfo, type CarrierEntry
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
export const signalHistory = signal<Map<string, Array<{ timestamp: number, value: any }>>>(new Map());

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

/**
 * Maps a device ID to a unit ID using the current rules.
 * Supports exact matches and wildcards (e.g. "PLC_*").
 */
export function applyDeviceMapping(deviceId: string): string | null {
    if (!mapRules.value?.deviceToUnit) return null;

    for (const mapping of mapRules.value.deviceToUnit) {
        const pattern = mapping.pattern;
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(deviceId)) {
                return mapping.unitId;
            }
        } else if (pattern === deviceId) {
            return mapping.unitId;
        }
    }
    return null;
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
    for (const rule of sortedRules) {
        // Find if any device mapped to this unit has the signal specified in the rule matching the condition
        for (const key of latestSignalValues.value.keys()) {
            const [deviceId, signalName] = key.split('::');
            if (signalName !== rule.signal) continue;

            const targetUnitId = applyDeviceMapping(deviceId);
            if (targetUnitId !== unitId) continue;

            // Get value at playback time or latest
            const value = getSignalValueAtTime(key, playbackTime.value);
            if (value === undefined) continue;

            // Evaluate condition
            let match = false;
            switch (rule.op) {
                case '==': match = String(value) === String(rule.value); break;
                case '!=': match = String(value) !== String(rule.value); break;
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
    }

    return { color: mapRules.value.defaultColor || 'var(--bg-tertiary)' };
}

/**
 * Get signal value at a specific time, or latest if time is null.
 */
export function getSignalValueAtTime(key: string, time: number | null): any {
    // If no playback time, use latest value
    if (time === null) {
        return latestSignalValues.value.get(key);
    }

    // Look up in history
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
export function updateSignalValues(entries: { deviceId: string, signalName: string, value: any, timestamp?: string | number }[]): void {
    const newValues = new Map(latestSignalValues.value);
    const newHistory = new Map(signalHistory.value);
    let changed = false;

    for (const entry of entries) {
        const key = `${entry.deviceId}::${entry.signalName}`;

        // Update latest value
        if (newValues.get(key) !== entry.value) {
            newValues.set(key, entry.value);
            changed = true;
        }

        // Add to history if timestamp is provided
        if (entry.timestamp) {
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
 * @param sessionId - The session ID
 * @param sessionName - Display name for the session
 * @param entries - Log entries to populate signal values
 * @param startTime - Optional: Session start time from backend (Unix ms)
 * @param endTime - Optional: Session end time from backend (Unix ms)
 */
export function linkSignalLogSession(
    sessionId: string,
    sessionName: string,
    entries: { deviceId: string; signalName: string; value: any; timestamp?: string | number }[],
    startTime?: number,
    endTime?: number
): void {
    // Update linkage state
    signalLogSessionId.value = sessionId;
    signalLogFileName.value = sessionName;
    signalLogEntryCount.value = entries.length;

    // Push data to signal stores
    updateSignalValues(entries);

    // Use provided time range from session metadata (preferred)
    if (startTime !== undefined && endTime !== undefined && startTime > 0 && endTime > 0) {
        setPlaybackRange(startTime, endTime);
        return;
    }

    // Fallback: compute time range from entries (for backwards compatibility)
    if (entries.length > 0) {
        const timestamps = entries
            .map(e => {
                if (e.timestamp === undefined || e.timestamp === null) return null;
                if (typeof e.timestamp === 'number') return e.timestamp;
                const parsed = new Date(e.timestamp).getTime();
                return isNaN(parsed) ? null : parsed;
            })
            .filter((t): t is number => t !== null);
        if (timestamps.length > 0) {
            const computedStart = Math.min(...timestamps);
            const computedEnd = Math.max(...timestamps);
            setPlaybackRange(computedStart, computedEnd);
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

// Format playback time for display
export function formatPlaybackTime(timeMs: number | null): string {
    if (timeMs === null) return '--:--:--';
    const date = new Date(timeMs);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}
