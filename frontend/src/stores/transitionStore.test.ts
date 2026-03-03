import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    transitionConfig,
    transitionResults,
    transitionStats,
    calculateTransitions,
    type TransitionConfig
} from './transitionStore';
import { currentSession } from './logStore';

// Mock the API client — transition logic lives on the backend now
vi.mock('../api/client', () => ({
    fetchTransitions: vi.fn()
}));

import { fetchTransitions } from '../api/client';
const mockFetchTransitions = vi.mocked(fetchTransitions);

function createConfig(overrides: Partial<TransitionConfig> = {}): TransitionConfig {
    return {
        name: 'Transition Config',
        type: 'cycle',
        enabled: true,
        startDeviceId: 'D1',
        startSignalName: 'SigA',
        startCondition: 'equals',
        startValue: true,
        targetDuration: 2000,
        tolerance: 200,
        ...overrides
    };
}

function setSession(id = 'session-1') {
    currentSession.value = {
        id,
        fileId: 'file-1',
        status: 'complete',
        progress: 100
    };
}

// ============================================================================
// transitionStats — computed from transitionResults directly
// ============================================================================

describe('transitionStore transitionStats', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
    });

    it('computes extended summary metrics for non-empty results', () => {
        transitionConfig.value = createConfig();
        transitionResults.value = [
            { configName: 'Transition Config', startTime: 0, endTime: 1_000, duration: 1_000, status: 'ok' },
            { configName: 'Transition Config', startTime: 10_000, endTime: 12_000, duration: 2_000, status: 'ok' },
            { configName: 'Transition Config', startTime: 20_000, endTime: 23_000, duration: 3_000, status: 'above' },
            { configName: 'Transition Config', startTime: 30_000, endTime: 34_000, duration: 4_000, status: 'below' }
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

// ============================================================================
// calculateTransitions — verifies frontend ↔ backend integration
//
// Transition logic (cycle/a-to-b/value-populated) runs on the backend.
// These tests verify the frontend correctly calls the API and stores results.
// ============================================================================

describe('calculateTransitions – backend integration', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        currentSession.value = null;
        mockFetchTransitions.mockReset();
    });

    it('stores results from the backend response', async () => {
        setSession();
        transitionConfig.value = createConfig();
        mockFetchTransitions.mockResolvedValue([
            { startTime: 1_000, endTime: 3_000, duration: 2_000, status: 'ok' },
            { startTime: 5_000, endTime: 9_000, duration: 4_000, status: 'above' }
        ]);

        await calculateTransitions();

        expect(transitionResults.value).toHaveLength(2);
        expect(transitionResults.value[0]).toMatchObject({ duration: 2_000, status: 'ok' });
        expect(transitionResults.value[1]).toMatchObject({ duration: 4_000, status: 'above' });
    });

    it('clears results when no config is set', async () => {
        setSession();
        transitionResults.value = [
            { configName: 'old', startTime: 0, endTime: 1_000, duration: 1_000, status: 'ok' }
        ];
        transitionConfig.value = null;

        await calculateTransitions();

        expect(transitionResults.value).toHaveLength(0);
        expect(mockFetchTransitions).not.toHaveBeenCalled();
    });

    it('clears results when config is disabled', async () => {
        setSession();
        transitionConfig.value = createConfig({ enabled: false });

        await calculateTransitions();

        expect(transitionResults.value).toHaveLength(0);
        expect(mockFetchTransitions).not.toHaveBeenCalled();
    });

    it('clears results when session is not set', async () => {
        transitionConfig.value = createConfig();
        currentSession.value = null;

        await calculateTransitions();

        expect(transitionResults.value).toHaveLength(0);
        expect(mockFetchTransitions).not.toHaveBeenCalled();
    });

    it('clears results on API error', async () => {
        setSession();
        transitionConfig.value = createConfig();
        transitionResults.value = [
            { configName: 'old', startTime: 0, endTime: 1_000, duration: 1_000, status: 'ok' }
        ];
        mockFetchTransitions.mockRejectedValue(new Error('network error'));

        await calculateTransitions();

        expect(transitionResults.value).toHaveLength(0);
    });

    it('sends correct sessionId and body for a-to-b config', async () => {
        setSession('my-session-id');
        transitionConfig.value = createConfig({
            type: 'a-to-b',
            startDeviceId: 'B1ACNV13301-606',
            startSignalName: 'I_MOVE_IN',
            startCondition: 'equals',
            startValue: true,
            endDeviceId: 'B1ACNV13301-606',
            endSignalName: 'O_MOVE_IN_ACK',
            endCondition: 'equals',
            endValue: true,
            targetDuration: 1000,
            tolerance: 100,
        });
        mockFetchTransitions.mockResolvedValue([]);

        await calculateTransitions();

        expect(mockFetchTransitions).toHaveBeenCalledWith('my-session-id', {
            type: 'a-to-b',
            start: { deviceId: 'B1ACNV13301-606', signalName: 'I_MOVE_IN', condition: 'equals', value: true },
            end: { deviceId: 'B1ACNV13301-606', signalName: 'O_MOVE_IN_ACK', condition: 'equals', value: true },
            targetDuration: 1000,
            tolerance: 100,
        });
    });

    it('does not include end condition for cycle type', async () => {
        setSession('sess-2');
        transitionConfig.value = createConfig({
            type: 'cycle',
            startDeviceId: 'B1ACNV13301-314',
            startSignalName: 'I_LEVEL1_BCR_READ_OK',
            startCondition: 'equals',
            startValue: true,
        });
        mockFetchTransitions.mockResolvedValue([]);

        await calculateTransitions();

        const [, body] = mockFetchTransitions.mock.calls[0];
        expect(body.end).toBeUndefined();
    });

    it('configName is set from config on each result', async () => {
        setSession();
        transitionConfig.value = createConfig({ name: 'My Config' });
        mockFetchTransitions.mockResolvedValue([
            { startTime: 0, endTime: 500, duration: 500, status: 'ok' }
        ]);

        await calculateTransitions();

        expect(transitionResults.value[0].configName).toBe('My Config');
    });
});
