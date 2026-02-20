/**
 * Map Store (Legacy Entry Point)
 * 
 * ⚠️ This file is kept for backward compatibility.
 * 
 * The map store has been refactored into a modular structure:
 * - stores/map/state.ts - Signals and computed values
 * - stores/map/actions.ts - Action functions
 * - stores/map/utils.ts - Helper functions
 * - stores/map/effects.ts - Side effects
 * - stores/map/types.ts - TypeScript interfaces
 * - stores/map/index.ts - Main exports
 * 
 * Please import from 'stores/map' for new code.
 */

// Re-export everything from the modular store
export * from './map';

// Debug helper for browser console
// Debug helper imports
import {
    mapLayout, mapZoom, mapOffset, selectedUnitId,
    mapRules, carrierLocations, latestSignalValues,
    playbackTime, isPlaying, followedCarrierId
} from './map';

declare global {
    interface Window {
        mapStore?: typeof mapStoreDebug;
    }
}

const mapStoreDebug = {
    mapLayout,
    mapZoom,
    mapOffset,
    selectedUnitId,
    mapRules,
    carrierLocations,
    latestSignalValues,
    playbackTime,
    isPlaying,
    followedCarrierId
};

if (typeof window !== 'undefined') {
    window.mapStore = mapStoreDebug;
}
