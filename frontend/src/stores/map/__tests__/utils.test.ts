/**
 * Map Store Utilities Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    applyDeviceMapping,
    getCarrierCountColor,
    getCarriersAtUnit,
    formatPlaybackTime
} from '../utils';
import {
    carrierLocations,
    mapRules,
    clearCaches,
    unitSignalCache,
    regexCache
} from '../state';
import type { MapRules } from '../types';

describe('mapStore Utils', () => {
    beforeEach(() => {
        // Reset state
        carrierLocations.value = new Map();
        mapRules.value = null;
        clearCaches();
    });

    describe('applyDeviceMapping', () => {
        it('should return unitId for exact match', () => {
            mapRules.value = {
                deviceToUnit: [
                    { pattern: 'PLC_001', unitId: 'UNIT_A' }
                ]
            } as MapRules;

            expect(applyDeviceMapping('PLC_001')).toBe('UNIT_A');
        });

        it('should return unitId for wildcard match', () => {
            mapRules.value = {
                deviceToUnit: [
                    { pattern: 'PLC_*', unitId: 'UNIT_B' }
                ]
            } as MapRules;

            expect(applyDeviceMapping('PLC_123')).toBe('UNIT_B');
        });

        it('should use fallback heuristic when no rules match', () => {
            mapRules.value = { deviceToUnit: [] } as MapRules;

            // Pattern: "...Belts.B1ACNV13301-102@B13" -> "B1ACNV13301-102"
            expect(applyDeviceMapping('Belts.B1ACNV13301-102@B13')).toBe('B1ACNV13301-102');
        });

        it('should return deviceId as-is when no pattern matches', () => {
            mapRules.value = { deviceToUnit: [] } as MapRules;

            expect(applyDeviceMapping('SimpleDevice')).toBe('SimpleDevice');
        });
    });

    describe('getCarrierCountColor', () => {
        it('should return gray for 0 carriers', () => {
            expect(getCarrierCountColor(0)).toBe('#3a3a3a');
        });

        it('should return green for 1 carrier', () => {
            expect(getCarrierCountColor(1)).toBe('#90EE90');
        });

        it('should return yellow for 2 carriers', () => {
            expect(getCarrierCountColor(2)).toBe('#FFD700');
        });

        it('should return orange for 3 carriers', () => {
            expect(getCarrierCountColor(3)).toBe('#FFA500');
        });

        it('should return red for 4+ carriers', () => {
            expect(getCarrierCountColor(4)).toBe('#FF4444');
            expect(getCarrierCountColor(10)).toBe('#FF4444');
        });
    });

    describe('getCarriersAtUnit', () => {
        it('should return empty array when no carriers', () => {
            carrierLocations.value = new Map();
            expect(getCarriersAtUnit('UNIT_A')).toEqual([]);
        });

        it('should return carriers at specific unit', () => {
            carrierLocations.value = new Map([
                ['CARRIER_1', 'UNIT_A'],
                ['CARRIER_2', 'UNIT_A'],
                ['CARRIER_3', 'UNIT_B']
            ]);

            expect(getCarriersAtUnit('UNIT_A')).toEqual(['CARRIER_1', 'CARRIER_2']);
            expect(getCarriersAtUnit('UNIT_B')).toEqual(['CARRIER_3']);
        });
    });

    describe('formatPlaybackTime', () => {
        it('should return placeholder for null', () => {
            expect(formatPlaybackTime(null)).toBe('--:--:--');
        });

        it('should format time correctly', () => {
            // Feb 19, 2026 06:21:46.050 UTC
            const timestamp = new Date('2026-02-19T06:21:46.050Z').getTime();
            expect(formatPlaybackTime(timestamp)).toBe('06:21:46.050');
        });

        it('should pad single digits', () => {
            // Jan 1, 2026 01:02:03.004 UTC
            const timestamp = new Date('2026-01-01T01:02:03.004Z').getTime();
            expect(formatPlaybackTime(timestamp)).toBe('01:02:03.004');
        });
    });

    describe('clearCaches', () => {
        it('should clear unit signal cache', () => {
            unitSignalCache.set('UNIT_A', new Map());
            clearCaches();
            expect(unitSignalCache.size).toBe(0);
        });

        it('should clear regex cache', () => {
            regexCache.set('PLC_*', /PLC_.*/);
            clearCaches();
            expect(regexCache.size).toBe(0);
        });
    });
});
