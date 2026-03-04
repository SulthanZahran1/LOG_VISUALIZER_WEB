import { act, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferHeatmap } from '../TransferHeatmap';
import { currentSession, logEntries } from '../../../stores/logStore';
import type { LogEntry, ParseSession } from '../../../models/types';

vi.mock('../../../api/client', () => ({
    getParseEntries: vi.fn(),
}));

import { getParseEntries } from '../../../api/client';

const mockGetParseEntries = vi.mocked(getParseEntries);

function createTRSEntry(timestamp: number, rackId: string, cmdID: string): LogEntry {
    return {
        deviceId: `CARRIER-${cmdID}`,
        signalName: 'Transfer',
        timestamp,
        value: `${cmdID}|COMPLETED|${rackId}|||TR_SUCCESS`,
        signalType: 'string',
    };
}

function createSession(): ParseSession {
    return {
        id: 'trs-session-1',
        fileId: 'file-1',
        status: 'complete',
        progress: 100,
        entryCount: 100001,
        parserName: 'trs_log',
    };
}

describe('TransferHeatmap', () => {
    beforeEach(() => {
        currentSession.value = null;
        logEntries.value = [];
        mockGetParseEntries.mockReset();
    });

    it('loads all TRS pages in server-side mode before rendering the heatmap', async () => {
        const firstPageEntries = Array.from({ length: 1000 }, (_, index) =>
            createTRSEntry(1000 + index, '204501', String(index + 1))
        );
        const secondPageEntries = [createTRSEntry(5000, '399901', '1001')];

        mockGetParseEntries
            .mockResolvedValueOnce({
                entries: firstPageEntries,
                total: 1001,
                page: 1,
                pageSize: 1000,
            })
            .mockResolvedValueOnce({
                entries: secondPageEntries,
                total: 1001,
                page: 2,
                pageSize: 1000,
            });

        act(() => {
            currentSession.value = createSession();
            logEntries.value = [createTRSEntry(1, '204501', 'stale-page-entry')];
        });

        render(<TransferHeatmap showControls={false} />);

        await waitFor(() => {
            expect(mockGetParseEntries).toHaveBeenCalledTimes(2);
        });

        expect(mockGetParseEntries).toHaveBeenNthCalledWith(1, 'trs-session-1', 1, 1000, undefined, expect.any(AbortSignal));
        expect(mockGetParseEntries).toHaveBeenNthCalledWith(2, 'trs-session-1', 2, 1000, undefined, expect.any(AbortSignal));

        await waitFor(() => {
            expect(screen.getByText('Z3-Y01')).toBeInTheDocument();
        });

        expect(screen.getByText('X999')).toBeInTheDocument();
    });
});
