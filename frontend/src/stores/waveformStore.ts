/**
 * Waveform Store (Legacy Entry Point)
 * 
 * ⚠️ This file is kept for backward compatibility.
 * 
 * The waveform store has been refactored into a modular structure:
 * - stores/waveform/state.ts - Signals and computed values
 * - stores/waveform/actions.ts - Action functions
 * - stores/waveform/effects.ts - Side effects
 * - stores/waveform/types.ts - TypeScript interfaces
 * - stores/waveform/index.ts - Main exports
 * 
 * Please import from 'stores/waveform' for new code.
 */

// Re-export everything from the modular store
export * from './waveform';

// Debug helper for browser console
import {
    scrollOffset, zoomLevel, viewportWidth,
    selectedSignals, waveformEntries, viewRange, selectionRange
} from './waveform';

declare global {
    interface Window {
        waveformStore?: typeof waveformStoreDebug;
    }
}

const waveformStoreDebug = {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    selectedSignals,
    waveformEntries,
    viewRange,
    selectionRange
};

if (typeof window !== 'undefined') {
    window.waveformStore = waveformStoreDebug;
}
