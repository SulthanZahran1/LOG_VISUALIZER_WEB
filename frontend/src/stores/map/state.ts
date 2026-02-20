/**
 * Map Store State
 * 
 * All signals and computed values for map functionality.
 * This file contains no logic - just state definitions.
 */

import { signal, computed } from '@preact/signals';
import type { MapLayout, SignalHistoryEntry } from './types';
import type { MapRules, RecentMapFiles, CarrierLogInfo, CarrierEntry, DefaultMapInfo } from '../../api/client';

// ======================
// Layout State
// ======================
export const mapLayout = signal<MapLayout | null>(null);
export const mapLoading = signal(false);
export const mapError = signal<string | null>(null);

export const mapZoom = signal(1.0);
export const mapOffset = signal({ x: 0, y: 0 });
export const selectedUnitId = signal<string | null>(null);

// ======================
// Rules State
// ======================
export const mapRules = signal<MapRules | null>(null);
export const rulesLoading = signal(false);
export const rulesError = signal<string | null>(null);

// ======================
// Recent Files State
// ======================
export const recentMapFiles = signal<RecentMapFiles | null>(null);
export const recentFilesLoading = signal(false);

// ======================
// Viewport State
// ======================
export const viewportSize = signal({ width: 0, height: 0 });

export const canEnableRules = computed(() => !!mapLayout.value && !!mapRules.value);

// ======================
// Default Maps State
// ======================
export const defaultMaps = signal<DefaultMapInfo[]>([]);
export const defaultMapsLoading = signal(false);

// ======================
// Carrier Log State
// ======================
export const carrierLogInfo = signal<CarrierLogInfo | null>(null);
export const carrierLogEntries = signal<CarrierEntry[]>([]);
export const carrierLogLoading = signal(false);
export const carrierLogFileName = signal<string | null>(null);

// ======================
// Signal Log Linkage State
// ======================
export const signalLogSessionId = signal<string | null>(null);
export const signalLogFileName = signal<string | null>(null);
export const signalLogEntryCount = signal<number>(0);

// Server-side mode determination for map viewer
const MAP_SERVER_SIDE_THRESHOLD = 100000;
export const mapUseServerSide = computed(() => signalLogEntryCount.value > MAP_SERVER_SIDE_THRESHOLD);

// ======================
// Follow State
// ======================
export const followedCarrierId = signal<string | null>(null);

// ======================
// Playback State
// ======================
export const playbackTime = signal<number | null>(null);
export const isPlaying = signal(false);
export const playbackSpeed = signal(1);
export const playbackStartTime = signal<number | null>(null);
export const playbackEndTime = signal<number | null>(null);

// Playback interval ID (managed in effects.ts)
export let playbackIntervalId: number | null = null;
export function setPlaybackIntervalId(id: number | null) {
    playbackIntervalId = id;
}

// ======================
// Carrier Tracking State
// ======================
export const carrierTrackingEnabled = signal(false);
export const carrierLocations = signal<Map<string, string>>(new Map()); // carrierId -> unitId
export const latestSignalValues = signal<Map<string, unknown>>(new Map()); // deviceId::signalName -> value

// Signal history for time-based playback (client-side mode only)
export const signalHistory = signal<Map<string, SignalHistoryEntry[]>>(new Map());

// ======================
// Derived State
// ======================
export const mapObjectsArray = computed(() => {
    if (!mapLayout.value) return [];
    return Object.values(mapLayout.value.objects);
});

// Count carriers at each unit
export const unitCarrierCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const unitId of carrierLocations.value.values()) {
        counts.set(unitId, (counts.get(unitId) || 0) + 1);
    }
    return counts;
});

// ======================
// Cache State
// ======================
// Cache for identifying relevant signals for a unit: Map<UnitID, Map<SignalName, DeviceID>>
export const unitSignalCache = new Map<string, Map<string, string>>();
export const regexCache = new Map<string, RegExp>();

export function clearCaches() {
    unitSignalCache.clear();
    regexCache.clear();
}
