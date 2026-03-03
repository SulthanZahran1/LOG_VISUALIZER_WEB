import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransitionTable } from './TransitionTable';
import { resultFilter, transitionResults } from '../../stores/transitionStore';

describe('TransitionTable', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resultFilter.value = 'all';
        transitionResults.value = [
            {
                configName: 'Config A',
                startTime: 1000,
                endTime: 2500,
                duration: 1500,
                status: 'ok'
            },
            {
                configName: 'Config B',
                startTime: 5000,
                endTime: 7700,
                duration: 2700,
                status: 'above'
            }
        ];
    });

    it('copies currently displayed table rows to clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        });

        render(<TransitionTable />);

        fireEvent.click(screen.getByLabelText('Copy table rows'));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).toContain('Start Time (ISO)\tEnd Time (ISO)\tDuration (ms)\tStatus');
        expect(copied).not.toContain('Configuration');
    });

    it('exports currently displayed table rows as CSV', async () => {
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:transition');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        render(<TransitionTable />);

        fireEvent.click(screen.getByLabelText('Export table rows as CSV'));

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:transition');

        const csvBlob = createObjectURL.mock.calls[0][0] as Blob;
        const csvText = await csvBlob.text();
        expect(csvText).toContain('Start Time (ISO),End Time (ISO),Duration (ms),Status');
        expect(csvText).not.toContain('Configuration');
    });
});
