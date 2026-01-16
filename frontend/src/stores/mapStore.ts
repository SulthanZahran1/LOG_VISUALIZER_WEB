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
        for (const [key, value] of latestSignalValues.value.entries()) {
            const [deviceId, signalName] = key.split('::');
            if (signalName !== rule.signal) continue;

            const targetUnitId = applyDeviceMapping(deviceId);
            if (targetUnitId !== unitId) continue;

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

// Bulk update signal values
export function updateSignalValues(entries: { deviceId: string, signalName: string, value: any }[]): void {
    const newValues = new Map(latestSignalValues.value);
    let changed = false;

    for (const entry of entries) {
        const key = `${entry.deviceId}::${entry.signalName}`;
        if (newValues.get(key) !== entry.value) {
            newValues.set(key, entry.value);
            changed = true;
        }

        // Also handle carrier tracking if it's a CurrentLocation signal
        if (entry.signalName === 'CurrentLocation') {
            processLogEntryForCarrier(entry.deviceId, entry.signalName, entry.value);
        }
    }

    if (changed) {
        latestSignalValues.value = newValues;
    }
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
