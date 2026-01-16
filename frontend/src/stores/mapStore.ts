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

