import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransitionView } from './TransitionView';
import { currentSession, isStreaming, logEntries } from '../../stores/logStore';
import {
    isCalculating,
    resultFilter,
    transitionConfig,
    transitionResults,
    trendSettings,
    viewMode,
    type TransitionConfig
} from '../../stores/transitionStore';
import type { LogEntry, ParseSession } from '../../models/types';

function createSession(status: ParseSession['status'], id = 'session-1'): ParseSession {
    return {
        id,
        fileId: 'file-1',
        status,
        progress: status === 'complete' ? 100 : 50,
    };
}

function createCycleConfig(name: string, deviceId: string, signalName: string): TransitionConfig {
    return {
        name,
        type: 'cycle',
        enabled: true,
        startDeviceId: deviceId,
        startSignalName: signalName,
        startCondition: 'equals',
        startValue: true,
        targetDuration: 1000,
        tolerance: 100,
    };
}

describe('TransitionView', () => {
    beforeEach(() => {
        transitionConfig.value = null;
        transitionResults.value = [];
        isCalculating.value = false;
        viewMode.value = 'table';
        resultFilter.value = 'all';
        trendSettings.value = {
            aggregationType: 'moving-average',
            movingAverageWindow: 10,
            timeBucketMinutes: 5,
            displayMode: 'line'
        };

        currentSession.value = null;
        logEntries.value = [];
        isStreaming.value = false;
    });

    it('resets to a fresh single-transition configuration on mount', () => {
        const existingConfig = createCycleConfig('Existing Config', 'D1', 'SigA');

        act(() => {
            currentSession.value = createSession('complete');
            transitionConfig.value = existingConfig;
            transitionResults.value = [{
                configName: existingConfig.name,
                startTime: 1000,
                endTime: 2000,
                duration: 1000,
                status: 'ok'
            }];
        });

        render(<TransitionView />);

        expect(transitionConfig.value).toBeNull();
        expect(transitionResults.value).toHaveLength(0);
        expect(screen.getAllByText('Configure Transition').length).toBeGreaterThan(0);
    });

    it('recalculates when a config is set and session becomes complete', async () => {
        const config = createCycleConfig('Cycle A', 'D1', 'SigA');

        act(() => {
            currentSession.value = createSession('parsing');
        });

        render(<TransitionView />);

        const entries: LogEntry[] = [
            { deviceId: 'D1', signalName: 'SigA', timestamp: 1000, value: true, signalType: 'boolean' },
            { deviceId: 'D1', signalName: 'SigA', timestamp: 2500, value: true, signalType: 'boolean' },
        ];

        act(() => {
            transitionConfig.value = config;
            logEntries.value = entries;
            currentSession.value = createSession('complete');
        });

        await waitFor(() => {
            expect(transitionResults.value).toHaveLength(1);
        });

        expect(transitionResults.value[0].configName).toBe('Cycle A');
    });

    it('replaces existing config instead of creating multiple rules', async () => {
        act(() => {
            currentSession.value = createSession('complete');
            logEntries.value = [
                { deviceId: 'D1', signalName: 'SigA', timestamp: 1000, value: true, signalType: 'boolean' }
            ];
        });

        const { container } = render(<TransitionView />);

        const nameInput = container.querySelector('input[placeholder="e.g., Cycle Time Config"]') as HTMLInputElement;
        fireEvent.input(nameInput, { target: { value: 'First Config' } });

        const selects = container.querySelectorAll('fieldset.condition-fieldset select');
        const deviceSelect = selects[0] as HTMLSelectElement;
        const signalSelect = selects[1] as HTMLSelectElement;
        fireEvent.change(deviceSelect, { target: { value: 'D1' } });
        fireEvent.change(signalSelect, { target: { value: 'SigA' } });

        fireEvent.click(screen.getByText('Apply Configuration'));

        await waitFor(() => {
            expect(transitionConfig.value).not.toBeNull();
        });
        expect(transitionConfig.value?.name).toBe('First Config');

        fireEvent.click(screen.getByText('Edit Configuration'));

        const updatedNameInput = container.querySelector('input[placeholder="e.g., Cycle Time Config"]') as HTMLInputElement;
        fireEvent.input(updatedNameInput, { target: { value: 'Updated Config' } });
        fireEvent.click(screen.getByText('Save Configuration'));

        await waitFor(() => {
            expect(transitionConfig.value?.name).toBe('Updated Config');
        });
    });

    it('shows per-tab intuition help and updates content when tab changes', async () => {
        act(() => {
            currentSession.value = createSession('complete');
            transitionConfig.value = createCycleConfig('Config', 'D1', 'SigA');
            transitionResults.value = [{
                configName: 'Config',
                startTime: 1000,
                endTime: 2000,
                duration: 1000,
                status: 'ok'
            }];
        });

        render(<TransitionView />);

        fireEvent.click(screen.getByLabelText('Help for Table View'));
        expect(screen.getByText('Use this when you need exact events and durations.')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Stats'));
        await waitFor(() => {
            expect(screen.getByText('Use this to understand overall process stability.')).toBeInTheDocument();
        });
    });
});
