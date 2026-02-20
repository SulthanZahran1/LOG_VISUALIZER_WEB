/**
 * Map Store
 * 
 * Modular store for map functionality.
 * 
 * Architecture:
 * - state.ts: Signals and computed values
 * - actions.ts: Async action functions
 * - utils.ts: Pure helper functions
 * - effects.ts: Side effects
 * - types.ts: TypeScript interfaces
 * 
 * This index file re-exports everything for backward compatibility.
 */

// ======================
// Types
// ======================
export type {
    MapObject,
    MapLayout,
    UnitColorResult,
    SignalHistoryEntry,
    MapRules,
    RecentMapFiles,
    CarrierLogInfo,
    CarrierEntry,
    DefaultMapInfo
} from './types';

// ======================
// State (Signals & Computed)
// ======================
export {
    // Layout
    mapLayout,
    mapLoading,
    mapError,
    mapZoom,
    mapOffset,
    selectedUnitId,
    // Rules
    mapRules,
    rulesLoading,
    rulesError,
    canEnableRules,
    // Recent files
    recentMapFiles,
    recentFilesLoading,
    // Viewport
    viewportSize,
    // Default maps
    defaultMaps,
    defaultMapsLoading,
    // Carrier log
    carrierLogInfo,
    carrierLogEntries,
    carrierLogLoading,
    carrierLogFileName,
    // Signal log linkage
    signalLogSessionId,
    signalLogFileName,
    signalLogEntryCount,
    mapUseServerSide,
    // Follow
    followedCarrierId,
    // Playback
    playbackTime,
    isPlaying,
    playbackSpeed,
    playbackStartTime,
    playbackEndTime,
    // Carrier tracking
    carrierTrackingEnabled,
    carrierLocations,
    latestSignalValues,
    signalHistory,
    // Derived
    mapObjectsArray,
    unitCarrierCounts,
    // Cache
    clearCaches
} from './state';

// ======================
// Actions
// ======================
export {
    // Layout
    fetchMapLayout,
    fetchMapRules,
    fetchRecentMapFiles,
    loadMap,
    // Default maps
    fetchDefaultMaps,
    loadDefaultMapByName,
    // Carrier log
    fetchCarrierLog,
    loadCarrierEntries,
    toggleCarrierTracking,
    // Signal log linkage
    linkSignalLogSession,
    type SignalLogEntry,
    // Signal value management
    updateSignalValues,
    processLogEntryForCarrier,
    // Playback
    play,
    pause,
    togglePlayback,
    skipForward,
    skipBackward,
    setPlaybackTime,
    setPlaybackSpeed,
    setPlaybackRange,
    // Time sync
    initMapSync
} from './actions';

// ======================
// Utilities
// ======================
export {
    centerOnUnit,
    centerOnCarrier,
    getCarriersAtUnit,
    applyDeviceMapping,
    getSignalValueAtTime,
    getUnitColor,
    getCarrierCountColor,
    getCarrierDisplayText,
    formatPlaybackTime
} from './utils';

// ======================
// Effects
// ======================
export {
    initFollowCarrierEffect,
    initTimeSyncEffect,
    initServerSideFetchEffect,
    initMapEffects
} from './effects';
