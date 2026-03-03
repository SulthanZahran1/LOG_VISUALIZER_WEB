import { beforeEach, describe, expect, it } from 'vitest';
import {
    transitionConfig,
    transitionResults,
    transitionStats,
    calculateTransitions,
    type TransitionConfig
} from './transitionStore';
import { logEntries } from './logStore';

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

// ============================================================================
// calculateTransitions — real PLC log data format
//
// Signal shapes observed in test_data_for_transition.log:
//   deviceId:   "B1ACNV13301-623"  (last path segment, @B159 stripped)
//   signalName: "I_MOVE_IN"        (part after colon in [INPUT2:I_MOVE_IN])
//   Boolean ON/OFF → stored as JS true/false
//   Short (unknown type) → inferred as integer, stored as number
//   String → stored as string
// ============================================================================

describe('calculateTransitions – PLC boolean signals (ON/OFF)', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        logEntries.value = [];
    });

    it('cycle: detects consecutive ON events for I_LEVEL1_BCR_READ_OK', () => {
        // Pattern from log: B1ACNV13301-314 I_LEVEL1_BCR_READ_OK goes ON repeatedly
        logEntries.value = [
            { deviceId: 'B1ACNV13301-314', signalName: 'I_LEVEL1_BCR_READ_OK', timestamp: 1_000, value: true,  signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-314', signalName: 'I_LEVEL1_BCR_READ_OK', timestamp: 1_500, value: false, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-314', signalName: 'I_LEVEL1_BCR_READ_OK', timestamp: 2_354, value: true,  signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-314',
            startSignalName: 'I_LEVEL1_BCR_READ_OK',
            startCondition: 'equals',
            startValue: true,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(1_354); // 2354 - 1000
        expect(transitionResults.value[0].status).toBe('no-target');
    });

    it('a-to-b: measures time from I_LEVEL1_BCR_READ_OK ON to OFF on same device', () => {
        // Actual pattern in the log: B1ACNV13301-304 ON at :06.162, OFF at :06.547
        logEntries.value = [
            { deviceId: 'B1ACNV13301-304', signalName: 'I_LEVEL1_BCR_READ_OK', timestamp: 1_000, value: true,  signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-304', signalName: 'I_LEVEL1_BCR_READ_OK', timestamp: 1_385, value: false, signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'a-to-b',
            enabled: true,
            startDeviceId: 'B1ACNV13301-304',
            startSignalName: 'I_LEVEL1_BCR_READ_OK',
            startCondition: 'equals',
            startValue: true,
            endDeviceId: 'B1ACNV13301-304',
            endSignalName: 'I_LEVEL1_BCR_READ_OK',
            endCondition: 'equals',
            endValue: false,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(385);
    });

    it('a-to-b: measures time from I_MOVE_IN ON to O_MOVE_IN_ACK ON (cross-signal)', () => {
        // A device receives I_MOVE_IN=ON then responds with O_MOVE_IN_ACK=ON
        logEntries.value = [
            { deviceId: 'B1ACNV13301-606', signalName: 'I_MOVE_IN',    timestamp: 1_000, value: true, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-606', signalName: 'O_MOVE_IN_ACK', timestamp: 1_015, value: true, signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'a-to-b',
            enabled: true,
            startDeviceId: 'B1ACNV13301-606',
            startSignalName: 'I_MOVE_IN',
            startCondition: 'equals',
            startValue: true,
            endDeviceId: 'B1ACNV13301-606',
            endSignalName: 'O_MOVE_IN_ACK',
            endCondition: 'equals',
            endValue: true,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(15);
    });

    it('cycle: ignores entries from different devices with same signal name', () => {
        // Each device in the log has its own I_MOVE_IN — they must NOT cross-match
        logEntries.value = [
            { deviceId: 'B1ACNV13301-606', signalName: 'I_MOVE_IN', timestamp: 1_000, value: true, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-626', signalName: 'I_MOVE_IN', timestamp: 2_000, value: true, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-606', signalName: 'I_MOVE_IN', timestamp: 3_000, value: true, signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-606',
            startSignalName: 'I_MOVE_IN',
            startCondition: 'equals',
            startValue: true,
        };

        calculateTransitions();

        // Only 2 B1ACNV13301-606 entries; the B1ACNV13301-626 entry is ignored
        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(2_000); // 3000 - 1000
    });

    it('returns no results when only one occurrence of start condition exists', () => {
        // Small file scenario: each device appears only once
        logEntries.value = [
            { deviceId: 'B1ACNV13301-606', signalName: 'I_MOVE_IN', timestamp: 1_000, value: true, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-559', signalName: 'I_MOVE_IN', timestamp: 2_000, value: true, signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-606',
            startSignalName: 'I_MOVE_IN',
            startCondition: 'equals',
            startValue: true,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(0);
    });
});

describe('calculateTransitions – Short/integer signals', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        logEntries.value = [];
    });

    it('cycle: detects transitions for I_BUFFER_STATUS integer values', () => {
        // Short type → integer after InferType; stored as number (0, 1, 2, 3…)
        logEntries.value = [
            { deviceId: 'B1ACNV13301-110', signalName: 'I_BUFFER_STATUS', timestamp: 1_000, value: 1, signalType: 'integer' },
            { deviceId: 'B1ACNV13301-110', signalName: 'I_BUFFER_STATUS', timestamp: 2_000, value: 0, signalType: 'integer' },
            { deviceId: 'B1ACNV13301-110', signalName: 'I_BUFFER_STATUS', timestamp: 3_500, value: 1, signalType: 'integer' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-110',
            startSignalName: 'I_BUFFER_STATUS',
            startCondition: 'equals',
            startValue: 1,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(2_500);
    });

    it('integer 0 does NOT match boolean false (type-safety guard)', () => {
        // Guards against the regression: if startValue defaults to 0 (from
        // parseFloat('true') → NaN → 0 before the fix), boolean false entries
        // should not be matched because false !== 0 under strict equality.
        logEntries.value = [
            { deviceId: 'B1ACNV13301-623', signalName: 'I_MOVE_IN', timestamp: 1_000, value: false, signalType: 'boolean' },
            { deviceId: 'B1ACNV13301-623', signalName: 'I_MOVE_IN', timestamp: 2_000, value: false, signalType: 'boolean' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-623',
            startSignalName: 'I_MOVE_IN',
            startCondition: 'equals',
            startValue: 0, // numeric 0 — the broken default before the fix
        };

        calculateTransitions();

        // false !== 0 and 'false' !== '0', so no match
        expect(transitionResults.value).toHaveLength(0);
    });

    it('I_EQP_STATE = 3 cycle time with Short/integer signals', () => {
        // Diverter I_EQP_STATE (Short → integer) cycling through state 3
        logEntries.value = [
            { deviceId: 'B1ACNV13301-103', signalName: 'I_EQP_STATE', timestamp: 1_000, value: 3, signalType: 'integer' },
            { deviceId: 'B1ACNV13301-103', signalName: 'I_EQP_STATE', timestamp: 2_000, value: 2, signalType: 'integer' },
            { deviceId: 'B1ACNV13301-103', signalName: 'I_EQP_STATE', timestamp: 3_447, value: 3, signalType: 'integer' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'cycle',
            enabled: true,
            startDeviceId: 'B1ACNV13301-103',
            startSignalName: 'I_EQP_STATE',
            startCondition: 'equals',
            startValue: 3,
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(2_447);
    });
});

describe('calculateTransitions – value-populated (String signals)', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        logEntries.value = [];
    });

    it('value-populated: measures time from empty to populated for V_LAST_MOVE_REQUEST_CARRIERID', () => {
        // String signals like V_LAST_MOVE_REQUEST_CARRIERID start empty then get a carrier ID
        logEntries.value = [
            { deviceId: 'B1ACNV13301-602', signalName: 'V_LAST_MOVE_REQUEST_CARRIERID', timestamp: 1_000, value: '',             signalType: 'string' },
            { deviceId: 'B1ACNV13301-602', signalName: 'V_LAST_MOVE_REQUEST_CARRIERID', timestamp: 1_777, value: 'SDADTN490140', signalType: 'string' },
        ];
        transitionConfig.value = {
            name: 'Transition Config',
            type: 'value-populated',
            enabled: true,
            startDeviceId: 'B1ACNV13301-602',
            startSignalName: 'V_LAST_MOVE_REQUEST_CARRIERID',
            startCondition: 'not-empty',
            startValue: '',
        };

        calculateTransitions();

        expect(transitionResults.value).toHaveLength(1);
        expect(transitionResults.value[0].duration).toBe(777);
    });
});
