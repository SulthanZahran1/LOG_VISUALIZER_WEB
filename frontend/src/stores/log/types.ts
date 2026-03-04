/**
 * Log Store Types
 * 
 * TypeScript interfaces for log-related state and operations.
 */

import type { LogEntry, ParseSession } from '../../models/types';
import type { TRSFieldKey } from '../../utils/trsLog';

export type ViewType = 'home' | 'log-table' | 'waveform' | 'map-viewer' | 'transitions' | 'heatmap';
export type SortColumnKey = keyof LogEntry | TRSFieldKey;

export interface ServerPageCache {
    page: number;
    entries: LogEntry[];
    timestamp: number;
    filterKey: string;
}

export interface FetchFilters {
    search?: string;
    category?: string;
    signalName?: string;
    deviceId?: string;
    sort?: SortColumnKey;
    order?: 'asc' | 'desc';
    type?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    signals?: string;
}

// Re-export models for convenience
export type { LogEntry, ParseSession };
