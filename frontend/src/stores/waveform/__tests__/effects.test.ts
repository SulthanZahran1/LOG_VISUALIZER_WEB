import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParseSession } from '../../../models/types';

vi.mock('../../../api/client', () => ({
    getParseChunk: vi.fn(),
    getParseSignals: vi.fn(),
    getParseSignalTypes: vi.fn(),
}));

import { getParseChunk } from '../../../api/client';
import { currentSession } from '../../log/state';
import { initChangedSignalsEffect } from '../effects';
import {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    showChangedInView,
    signalsWithChanges,
} from '../state';

function createSession(id: string): ParseSession {
    return {
        id,
        fileId: `file-${id}`,
        status: 'complete',
        progress: 100,
        startTime: 0,
        endTime: 1000,
        entryCount: 200000,
    };
}

function createNotFoundError(): Error & { status: number } {
    const err = new Error('session not found') as Error & { status: number };
    err.status = 404;
    return err;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flushEffects(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('waveform effects', () => {
    beforeAll(() => {
        initChangedSignalsEffect();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        currentSession.value = null;
        showChangedInView.value = false;
        signalsWithChanges.value = new Set();
        scrollOffset.value = 0;
        zoomLevel.value = 1;
        viewportWidth.value = 100;
    });

    it('does not clear current session when stale chunk request returns 404', async () => {
        const firstRequest = deferred<unknown[]>();
        vi.mocked(getParseChunk)
            .mockReturnValueOnce(firstRequest.promise as Promise<never[]>)
            .mockResolvedValueOnce([]);

        currentSession.value = createSession('session-a');
        showChangedInView.value = true;
        await flushEffects();

        currentSession.value = createSession('session-b');
        await flushEffects();

        firstRequest.reject(createNotFoundError());
        await flushEffects();

        expect(currentSession.value?.id).toBe('session-b');
    });

    it('clears session when active chunk request returns 404', async () => {
        vi.mocked(getParseChunk).mockRejectedValueOnce(createNotFoundError());

        currentSession.value = createSession('session-a');
        showChangedInView.value = true;
        await flushEffects();

        expect(currentSession.value).toBeNull();
    });
});
