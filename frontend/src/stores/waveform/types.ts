/**
 * Waveform Store Types
 * 
 * TypeScript interfaces for waveform-related state and operations.
 */

import type { LogEntry, TimeRange, SignalType } from '../../models/types';
import type { ChunkBoundaries } from '../../api/client';

export interface FilterPreset {
    name: string;
    searchQuery: string;
    isRegex: boolean;
    typeFilter: SignalType | 'all';
    showChangedInView: boolean;
}

export interface WaveformState {
    scrollOffset: number;
    zoomLevel: number;
    viewportWidth: number;
    hoverTime: number | null;
    selectionRange: { start: number; end: number } | null;
}

// Re-export models for convenience
export type { LogEntry, TimeRange, SignalType, ChunkBoundaries };
