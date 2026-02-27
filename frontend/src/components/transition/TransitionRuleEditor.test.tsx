import { act, fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransitionRuleEditor } from './TransitionRuleEditor';
import { logEntries } from '../../stores/logStore';
import type { LogEntry } from '../../models/types';

function setLogEntries(entries: LogEntry[]) {
    act(() => {
        logEntries.value = entries;
    });
}

describe('TransitionRuleEditor', () => {
    beforeEach(() => {
        logEntries.value = [];
    });

    it('uses separate device and signal comboboxes with signal list filtered by device', () => {
        setLogEntries([
            { deviceId: 'D1', signalName: 'SigBool', timestamp: 1000, value: true, signalType: 'boolean' },
            { deviceId: 'D1', signalName: 'SigText', timestamp: 1100, value: 'abc', signalType: 'string' },
            { deviceId: 'D2', signalName: 'SigInt', timestamp: 1200, value: 1, signalType: 'integer' }
        ]);

        render(<TransitionRuleEditor config={null} onSave={vi.fn()} onClose={vi.fn()} />);

        const startDevice = screen.getByLabelText('Start Device') as HTMLSelectElement;
        const startSignal = screen.getByLabelText('Start Signal') as HTMLSelectElement;

        expect(startSignal.disabled).toBe(true);

        fireEvent.change(startDevice, { target: { value: 'D2' } });

        const d2Options = Array.from(startSignal.options).map(option => option.textContent);
        expect(d2Options).toContain('SigInt');
        expect(d2Options).not.toContain('SigBool');

        fireEvent.change(startDevice, { target: { value: 'D1' } });

        const d1Options = Array.from(startSignal.options).map(option => option.textContent);
        expect(d1Options).toContain('SigBool');
        expect(d1Options).toContain('SigText');
        expect(d1Options).not.toContain('SigInt');
    });

    it('renders true/false combobox for boolean signals', () => {
        setLogEntries([
            { deviceId: 'D1', signalName: 'SigBool', timestamp: 1000, value: true, signalType: 'boolean' }
        ]);

        render(<TransitionRuleEditor config={null} onSave={vi.fn()} onClose={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Start Device'), { target: { value: 'D1' } });
        fireEvent.change(screen.getByLabelText('Start Signal'), { target: { value: 'SigBool' } });

        const startValue = screen.getByLabelText('Start Value') as HTMLSelectElement;
        expect(startValue.tagName).toBe('SELECT');
        expect(Array.from(startValue.options).map(option => option.value)).toEqual(['true', 'false']);
    });

    it('switches value input type based on selected signal datatype', () => {
        setLogEntries([
            { deviceId: 'D1', signalName: 'SigInt', timestamp: 1000, value: 10, signalType: 'integer' },
            { deviceId: 'D1', signalName: 'SigText', timestamp: 1200, value: 'value', signalType: 'string' }
        ]);

        render(<TransitionRuleEditor config={null} onSave={vi.fn()} onClose={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Start Device'), { target: { value: 'D1' } });

        fireEvent.change(screen.getByLabelText('Start Signal'), { target: { value: 'SigInt' } });
        let startValue = screen.getByLabelText('Start Value') as HTMLInputElement;
        expect(startValue.tagName).toBe('INPUT');
        expect(startValue.type).toBe('number');

        fireEvent.change(screen.getByLabelText('Start Signal'), { target: { value: 'SigText' } });
        startValue = screen.getByLabelText('Start Value') as HTMLInputElement;
        expect(startValue.tagName).toBe('INPUT');
        expect(startValue.type).toBe('text');
    });
});
