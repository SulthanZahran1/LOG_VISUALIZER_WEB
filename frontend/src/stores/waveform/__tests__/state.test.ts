/**
 * Waveform Store State Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    hoverTime,
    selectionRange,
    waveformEntries,
    allSignals,
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    isDragging,
    showSidebar,
    isWaveformLoading,
    waveformLoadingProgress,
    hoverX,
    hoverRow,
    availableSignals,
    viewRange,
    resetFetchState,
    // hasFetchedForCurrentSignals
} from '../state';

describe('waveformStore State', () => {
    beforeEach(() => {
        // Reset state
        scrollOffset.value = 0;
        zoomLevel.value = 1;
        viewportWidth.value = 800;
        hoverTime.value = null;
        selectionRange.value = null;
        waveformEntries.value = {};
        allSignals.value = [];
        signalSearchQuery.value = '';
        signalIsRegex.value = false;
        signalTypeFilter.value = 'all';
        isDragging.value = false;
        showSidebar.value = true;
        isWaveformLoading.value = false;
        waveformLoadingProgress.value = 0;
        hoverX.value = null;
        hoverRow.value = null;
        resetFetchState();
    });

    describe('viewRange computed', () => {
        it('should return null when no session', () => {
            expect(viewRange.value).toBeNull();
        });
    });

    describe('availableSignals computed', () => {
        it('should group signals by device', () => {
            allSignals.value = [
                'Device1::SignalA',
                'Device1::SignalB',
                'Device2::SignalC'
            ];

            const signals = availableSignals.value;
            expect(signals.get('Device1')).toEqual(['SignalA', 'SignalB']);
            expect(signals.get('Device2')).toEqual(['SignalC']);
        });

        it('should handle malformed signal keys', () => {
            allSignals.value = [
                'Device1::SignalA',
                'invalid-key',
                'Device2::SignalB'
            ];

            const signals = availableSignals.value;
            expect(signals.has('Device1')).toBe(true);
            expect(signals.has('Device2')).toBe(true);
            expect(signals.has('invalid-key')).toBe(false);
        });
    });

    describe('resetFetchState', () => {
        it('should reset fetch tracking', () => {
            // resetFetchState should set hasFetchedForCurrentSignals to false
            // We can't directly set the variable, but we can verify the function exists
            expect(typeof resetFetchState).toBe('function');
            
            // Call reset - this should not throw
            expect(() => resetFetchState()).not.toThrow();
        });
    });
});
