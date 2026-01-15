import { signal, computed } from '@preact/signals';
import { getMapLayout } from '../api/client';

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

// Actions
export async function fetchMapLayout() {
    mapLoading.value = true;
    mapError.value = null;
    try {
        const data = await getMapLayout();
        mapLayout.value = data;
    } catch (err: any) {
        mapError.value = err.message || 'Failed to fetch map layout';
    } finally {
        mapLoading.value = false;
    }
}

// Derived
export const mapObjectsArray = computed(() => {
    if (!mapLayout.value) return [];
    return Object.values(mapLayout.value.objects);
});
