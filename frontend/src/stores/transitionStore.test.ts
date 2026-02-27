import { beforeEach, describe, expect, it } from 'vitest';
import {
    transitionConfig,
    transitionResults,
    transitionStats,
    type TransitionConfig
} from './transitionStore';

function createConfig(): TransitionConfig {
    return {
        name: 'Stats Config',
        type: 'cycle',
        enabled: true,
        startDeviceId: 'D1',
        startSignalName: 'SigA',
        startCondition: 'equals',
        startValue: true,
        targetDuration: 2000,
        tolerance: 200
    };
}

describe('transitionStore transitionStats', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
    });

    it('computes extended summary metrics for non-empty results', () => {
        transitionConfig.value = createConfig();
        transitionResults.value = [
            { configName: 'Stats Config', startTime: 0, endTime: 1_000, duration: 1_000, status: 'ok' },
            { configName: 'Stats Config', startTime: 10_000, endTime: 12_000, duration: 2_000, status: 'ok' },
            { configName: 'Stats Config', startTime: 20_000, endTime: 23_000, duration: 3_000, status: 'above' },
            { configName: 'Stats Config', startTime: 30_000, endTime: 34_000, duration: 4_000, status: 'below' }
        ];

        const stats = transitionStats.value;
        expect(stats).not.toBeNull();

        expect(stats?.count).toBe(4);
        expect(stats?.min).toBe(1_000);
        expect(stats?.max).toBe(4_000);
        expect(stats?.average).toBe(2_500);
        expect(stats?.median).toBe(2_500);
        expect(stats?.p90).toBeCloseTo(3_700, 5);
        expect(stats?.p95).toBeCloseTo(3_850, 5);
        expect(stats?.stdDev).toBeCloseTo(1118.0339, 3);
        expect(stats?.range).toBe(3_000);
        expect(stats?.cv).toBeCloseTo(0.4472, 3);
        expect(stats?.totalDuration).toBe(10_000);

        expect(stats?.firstStartTime).toBe(0);
        expect(stats?.lastEndTime).toBe(34_000);
        expect(stats?.elapsedTime).toBe(34_000);
        expect(stats?.throughputPerHour).toBeCloseTo(423.5294, 3);

        expect(stats?.withinTarget).toBe(2);
        expect(stats?.aboveTarget).toBe(1);
        expect(stats?.belowTarget).toBe(1);
        expect(stats?.withinTargetPct).toBe(50);
        expect(stats?.aboveTargetPct).toBe(25);
        expect(stats?.belowTargetPct).toBe(25);
        expect(stats?.targetLowerBound).toBe(1_800);
        expect(stats?.targetUpperBound).toBe(2_200);
    });

    it('returns zeroed extended metrics when config exists but results are empty', () => {
        transitionConfig.value = createConfig();
        transitionResults.value = [];

        const stats = transitionStats.value;
        expect(stats).not.toBeNull();

        expect(stats?.count).toBe(0);
        expect(stats?.median).toBe(0);
        expect(stats?.p90).toBe(0);
        expect(stats?.p95).toBe(0);
        expect(stats?.range).toBe(0);
        expect(stats?.cv).toBe(0);
        expect(stats?.totalDuration).toBe(0);
        expect(stats?.firstStartTime).toBeNull();
        expect(stats?.lastEndTime).toBeNull();
        expect(stats?.elapsedTime).toBe(0);
        expect(stats?.throughputPerHour).toBe(0);
        expect(stats?.withinTargetPct).toBe(0);
        expect(stats?.aboveTargetPct).toBe(0);
        expect(stats?.belowTargetPct).toBe(0);
    });
});
