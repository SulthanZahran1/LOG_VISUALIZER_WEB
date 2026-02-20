/**
 * Map Store Effects
 * 
 * Side effects for map functionality.
 */

import { effect } from '@preact/signals';
import {
    updateSignalValues, getSyncFunctions
} from './actions';
import {
    followedCarrierId, carrierLocations,
    playbackTime, isPlaying, signalLogSessionId, mapUseServerSide,
    mapRules, carrierTrackingEnabled
} from './state';
import { centerOnUnit } from './utils';
import { getValuesAtTime } from '../../api/client';

// Track last synced time to avoid echo
let lastSyncedTime: number | null = null;

// Track fetch state for server-side mode
let fetchGeneration = 0;
let isFetchingState = false;
let lastFetchCompleteTime = 0;

/**
 * Effect: Auto-center on followed carrier
 */
export function initFollowCarrierEffect(): void {
    effect(() => {
        const cid = followedCarrierId.value;
        if (!cid) return;

        const uid = carrierLocations.value.get(cid);
        if (uid) {
            centerOnUnit(uid);
        }
    });
}

/**
 * Effect: Sync playbackTime changes to waveform
 */
export function initTimeSyncEffect(): void {
    effect(() => {
        const time = playbackTime.value;
        if (time === null) return;

        const { syncFromMapFn, isSyncEnabledFn } = getSyncFunctions();
        if (!syncFromMapFn || !isSyncEnabledFn) return;

        const syncEnabled = isSyncEnabledFn ? isSyncEnabledFn() : false;
        if (!syncEnabled) return;
        if (time === lastSyncedTime) return;

        lastSyncedTime = time;
        syncFromMapFn(time);
    });
}

/**
 * Effect: Server-side data fetching for large files
 * When a large log session is linked to the map, fetch signal state on-demand
 * for the current playback time.
 */
export function initServerSideFetchEffect(): void {
    effect(() => {
        const time = playbackTime.value;
        const playing = isPlaying.value;
        const large = mapUseServerSide.value;
        const linkedSessionId = signalLogSessionId.value;

        if (!large || !time || !linkedSessionId) return;

        const now = Date.now();
        const minInterval = playing ? 500 : 50;

        // During playback: throttle and skip if fetch in progress
        if (playing && (isFetchingState || (now - lastFetchCompleteTime < minInterval))) return;

        // Increment generation - any in-flight fetch with an older generation
        // will discard its results instead of applying stale data
        const gen = ++fetchGeneration;

        async function fetchValues() {
            isFetchingState = true;
            try {
                const rules = mapRules.value?.rules || [];
                const ruleSignalNames = new Set<string>(rules.map((r: {signal: string}) => r.signal));
                if (carrierTrackingEnabled.value) ruleSignalNames.add('CurrentLocation');

                let signalsToFetch: string[] | undefined;
                if (ruleSignalNames.size > 0) {
                    signalsToFetch = Array.from(ruleSignalNames);
                }

                const tsInt = Math.round(time!);
                const entries = await getValuesAtTime(linkedSessionId!, tsInt, signalsToFetch);

                // Only apply if this is still the latest fetch
                if (gen !== fetchGeneration) return;

                const signalEntries = entries.map(e => ({
                    deviceId: e.deviceId,
                    signalName: e.signalName,
                    value: e.value,
                    timestamp: e.timestamp
                }));

                updateSignalValues(signalEntries);
            } catch (err) {
                if (gen !== fetchGeneration) return;
                console.error('Failed to fetch signal state for Map Viewer (server-side):', err);
            } finally {
                if (gen === fetchGeneration) {
                    isFetchingState = false;
                    lastFetchCompleteTime = Date.now();
                }
            }
        }

        if (playing) {
            fetchValues();
        } else {
            // Debounce when scrubbing
            const timer = setTimeout(fetchValues, minInterval);
            return () => clearTimeout(timer);
        }
    });
}

/**
 * Initialize all map store effects.
 * Call this once during app initialization.
 */
export function initMapEffects(): void {
    initFollowCarrierEffect();
    initTimeSyncEffect();
    initServerSideFetchEffect();
}
