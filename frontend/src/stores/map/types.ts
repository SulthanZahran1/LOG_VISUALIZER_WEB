/**
 * Map Store Types
 * 
 * TypeScript interfaces for map-related state and operations.
 */

import type { MapRules, RecentMapFiles, CarrierLogInfo, CarrierEntry, DefaultMapInfo } from '../../api/client';

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

export interface UnitColorResult {
    color?: string;
    text?: string;
}

export interface SignalHistoryEntry {
    timestamp: number;
    value: any;
}

// Re-export API types for convenience
export type { MapRules, RecentMapFiles, CarrierLogInfo, CarrierEntry, DefaultMapInfo };
