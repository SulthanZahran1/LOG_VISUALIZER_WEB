import { describe, it, expect, beforeEach } from 'vitest';
import {
    mapLayout, mapZoom, mapOffset, viewportSize, followedCarrierId,
    carrierLocations, centerOnUnit, centerOnCarrier, latestSignalValues, clearCaches
} from './mapStore';

describe('mapStore Centering & Follow', () => {
    beforeEach(() => {
        // Reset state
        mapLayout.value = {
            version: '1.0',
            objects: {
                'UNIT1': { name: 'UNIT1', type: 'Station', location: '100,200', unitId: 'UNIT1', text: '', size: '10,10', flowDirection: '', foreColor: '', endCap: '', startCap: '', dashStyle: '', lineThick: '' }
            }
        };
        mapZoom.value = 1.0;
        mapOffset.value = { x: 0, y: 0 };
        viewportSize.value = { width: 1000, height: 800 };
        followedCarrierId.value = null;
        carrierLocations.value = new Map();
        latestSignalValues.value = new Map();
        clearCaches();
    });

    it('should calculate offset correctly in centerOnUnit', () => {
        centerOnUnit('UNIT1');

        // Expected offset = viewportSize / 2 - unitLocation * zoom
        // x = 1000 / 2 - 100 * 1 = 400
        // y = 800 / 2 - 200 * 1 = 200
        expect(mapOffset.value).toEqual({ x: 400, y: 200 });
    });

    it('should account for zoom in centerOnUnit', () => {
        mapZoom.value = 2.0;
        centerOnUnit('UNIT1');

        // x = 1000 / 2 - 100 * 2 = 500 - 200 = 300
        // y = 800 / 2 - 200 * 2 = 400 - 400 = 0
        expect(mapOffset.value).toEqual({ x: 300, y: 0 });
    });

    it('should center on carrier when following', () => {
        carrierLocations.value = new Map([['CARRIER1', 'UNIT1']]);
        centerOnCarrier('CARRIER1');
        expect(mapOffset.value).toEqual({ x: 400, y: 200 });
    });

    it('should ignore non-existent units', () => {
        mapOffset.value = { x: 123, y: 456 };
        centerOnUnit('UNKNOWN');
        // Should remain unchanged
        expect(mapOffset.value).toEqual({ x: 123, y: 456 });
    });
});
