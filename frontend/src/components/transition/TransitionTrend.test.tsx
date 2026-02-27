import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransitionTrend } from './TransitionTrend';
import {
    resultFilter,
    transitionConfig,
    transitionResults,
    trendSettings,
    viewMode,
    type TransitionConfig
} from '../../stores/transitionStore';

function createConfig(): TransitionConfig {
    return {
        name: 'Trend Config',
        type: 'cycle',
        enabled: true,
        startDeviceId: 'D1',
        startSignalName: 'SigA',
        startCondition: 'equals',
        startValue: true,
        targetDuration: 1000,
        tolerance: 100
    };
}

describe('TransitionTrend', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        resultFilter.value = 'all';
        viewMode.value = 'trend';
        trendSettings.value = {
            aggregationType: 'moving-average',
            movingAverageWindow: 10,
            timeBucketMinutes: 5,
            displayMode: 'line'
        };
    });

    it('recomputes data points when aggregation changes', async () => {
        const config = createConfig();

        act(() => {
            transitionConfig.value = config;
            transitionResults.value = [
                { configName: config.name, startTime: 0, endTime: 900, duration: 900, status: 'ok' },
                { configName: config.name, startTime: 60_000, endTime: 61_200, duration: 1200, status: 'above' },
                { configName: config.name, startTime: 120_000, endTime: 121_100, duration: 1100, status: 'above' },
            ];
        });

        render(<TransitionTrend />);

        expect(screen.getByText('3 data points')).toBeInTheDocument();

        const aggregationSelect = screen.getByDisplayValue('Moving Average');
        fireEvent.change(aggregationSelect, { target: { value: 'time-bucket' } });

        await waitFor(() => {
            expect(screen.getByText('1 data points')).toBeInTheDocument();
        });
    });
});
