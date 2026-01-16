import { signal, computed } from '@preact/signals';
import { getMapLayout, getMapRules, getRecentMapFiles, type MapRules, type RecentMapFiles } from '../api/client';

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
        // Truncate from start if too long (show last 8 chars)
        const id = carriers[0];
        return id.length > 8 ? '...' + id.slice(-8) : id;
    }
    return `${carriers.length}x`;
}

// Process a log entry for carrier tracking
export function processLogEntryForCarrier(deviceId: string, signalName: string, value: unknown): void {
    if (!carrierTrackingEnabled.value) return;
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

// Toggle carrier tracking
export function toggleCarrierTracking(): void {
    carrierTrackingEnabled.value = !carrierTrackingEnabled.value;
    if (!carrierTrackingEnabled.value) {
        // Clear all carrier locations when disabled
        carrierLocations.value = new Map();
    }
}
