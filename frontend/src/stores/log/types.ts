/**
 * Log Store Types
 * 
 * TypeScript interfaces for log-related state and operations.
 */

import type { LogEntry, ParseSession } from '../../models/types';

export type ViewType = 'home' | 'log-table' | 'waveform' | 'map-viewer' | 'transitions';

export interface ServerPageCache {
    page: number;
    entries: LogEntry[];
    timestamp: number;
    filterKey: string;
}

export interface FetchFilters {
    search?: string;
    category?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    type?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    signals?: string;
}

// Re-export models for convenience
export type { LogEntry, ParseSession };
