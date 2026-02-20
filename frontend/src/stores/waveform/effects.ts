/**
 * Waveform Store Effects
 * 
 * Side effects for waveform functionality.
 */

import { effect } from '@preact/signals';
import {
    getParseChunk, getParseSignals, getParseSignalTypes
} from '../../api/client';
import type { SignalType } from '../../models/types';
import { clearSession } from '../logStore';
import {
    currentSession, scrollOffset, zoomLevel, viewportWidth,
    allSignals, allSignalTypes, showChangedInView, signalsWithChanges,
    viewRange,
    setHasFetched,
    lastInitializedSessionId, setLastInitializedSessionId
} from './state';
import { updateWaveformEntries } from './actions';
import { selectedSignals } from '../selectionStore';

/**
 * Effect: Initialize view range from session info
 * Resets scrollOffset and zoom when a NEW session is loaded
 */
export function initViewportEffect(): void {
    effect(() => {
        const session = currentSession.value;
        if (session && session.status === 'complete' && session.startTime !== undefined) {
            if (session.id !== lastInitializedSessionId) {
                setLastInitializedSessionId(session.id);
                scrollOffset.value = session.startTime;

                // Set initial zoom to fit roughly 10 seconds or the whole thing if shorter
                const sessionDuration = session.endTime! - session.startTime;
                const targetDuration = Math.min(sessionDuration, 10000) || 1000;
                zoomLevel.value = viewportWidth.value / targetDuration;
            }
        } else if (!session) {
            setLastInitializedSessionId(null);
        }
    });
}

/**
 * Effect: Fetch all signals and signal types for the session once it's complete
 */
export function initSignalListEffect(): void {
    effect(() => {
        const session = currentSession.value;
        if (session && session.status === 'complete' && allSignals.value.length === 0) {
            Promise.all([
                getParseSignals(session.id),
                getParseSignalTypes(session.id),
            ]).then(([signals, typesRecord]) => {
                allSignals.value = signals;
                const typesMap = new Map<string, string>();
                for (const [key, val] of Object.entries(typesRecord)) {
                    typesMap.set(key, val as string);
                }
                allSignalTypes.value = typesMap as Map<string, SignalType>;
            }).catch(err => {
                if (err.status === 404) {
                    console.warn('Session not found on server during getParseSignals, clearing local state');
                    clearSession();
                } else {
                    console.error('Failed to fetch signals', err);
                }
            });
        } else if (!session) {
            allSignals.value = [];
            allSignalTypes.value = new Map();
        }
    });
}

/**
 * Effect: Fetch entries for the current viewport to identify signals with changes
 */
export function initChangedSignalsEffect(): void {
    effect(() => {
        const session = currentSession.value;
        const range = viewRange.value;
        const active = showChangedInView.value;

        if (!session || !range || !active) {
            signalsWithChanges.value = new Set();
            return;
        }

        getParseChunk(session.id, range.start, range.end).then(chunk => {
            const changed = new Set<string>();
            for (const e of chunk) {
                changed.add(`${e.deviceId}::${e.signalName}`);
            }
            signalsWithChanges.value = changed;
        }).catch(err => {
            if (err.status === 404) {
                console.warn('Session not found on server during chunk fetch, clearing local state');
                clearSession();
            } else {
                console.error('Failed to fetch chunk for changed signals', err);
            }
        });
    });
}

/**
 * Effect: Trigger update when session completes or selectedSignals changes
 */
export function initWaveformDataEffect(): void {
    effect(() => {
        // Access signals to create dependencies
        selectedSignals.value;
        const session = currentSession.value;
        const isLarge = (session?.entryCount ?? 0) > 100000;

        if (isLarge) {
            viewRange.value;
        }

        setHasFetched(false);

        const timer = setTimeout(() => {
            updateWaveformEntries();
        }, isLarge ? 150 : 0);

        return () => clearTimeout(timer);
    });
}

/**
 * Initialize all waveform store effects.
 */
export function initWaveformEffects(): void {
    initViewportEffect();
    initSignalListEffect();
    initChangedSignalsEffect();
    initWaveformDataEffect();
}
