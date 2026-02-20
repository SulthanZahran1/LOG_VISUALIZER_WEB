/**
 * Waveform Store
 * 
 * Modular store for waveform functionality.
 * 
 * Architecture:
 * - state.ts: Signals and computed values
 * - actions.ts: Action functions
 * - effects.ts: Side effects
 * - types.ts: TypeScript interfaces
 * 
 * This index file re-exports everything for backward compatibility.
 */

// ======================
// Types
// ======================
export type {
    FilterPreset,
    WaveformState,
    LogEntry,
    TimeRange,
    SignalType,
    ChunkBoundaries
} from './types';

// ======================
// State
// ======================
export {
    // Viewport
    scrollOffset,
    zoomLevel,
    viewportWidth,
    hoverTime,
    selectionRange,
    // Waveform data
    waveformEntries,
    waveformBoundaries,
    // Signals
    allSignals,
    allSignalTypes,
    showChangedInView,
    signalsWithChanges,
    // Filters
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    // Presets
    filterPresets,
    // UI
    isDragging,
    showSidebar,
    isWaveformLoading,
    waveformLoadingProgress,
    // Hover
    hoverX,
    hoverRow,
    // Computed
    availableSignals,
    deviceColors,
    viewRange,
    // Re-exports from selectionStore
    selectedSignals,
    focusedSignal,
    isSignalSelected,
    toggleSignal
} from './state';

// ======================
// Actions
// ======================
export {
    // Signal selection
    addSignal,
    removeSignal,
    selectAllSignalsForDevice,
    deselectAllSignalsForDevice,
    // Viewport navigation
    getViewportDuration,
    zoomAt,
    pan,
    jumpToTime,
    clearSelection,
    zoomToSelection,
    // Data fetching
    cancelWaveformLoading,
    updateWaveformEntries,
    refreshSignalData,
    // Presets
    savePreset,
    loadPreset,
    deletePreset
} from './actions';

// ======================
// Effects
// ======================
export {
    initViewportEffect,
    initSignalListEffect,
    initChangedSignalsEffect,
    initWaveformDataEffect,
    initWaveformEffects
} from './effects';
