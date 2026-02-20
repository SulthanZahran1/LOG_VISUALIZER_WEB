/**
 * Log Store State Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    currentSession,
    logEntries,
    totalEntries,
    isLoadingLog,
    logError,
    isParsing,
    useServerSide,
    sortColumn,
    sortDirection,
    searchQuery,
    categoryFilter,
    clearServerCache,
    serverPageCache,
    SERVER_PAGE_SIZE,
    LARGE_FILE_THRESHOLD
} from '../state';
import type { ParseSession, LogEntry } from '../types';

describe('logStore State', () => {
    beforeEach(() => {
        // Reset state
        currentSession.value = null;
        logEntries.value = [];
        totalEntries.value = 0;
        isLoadingLog.value = false;
        logError.value = null;
        sortColumn.value = 'timestamp';
        sortDirection.value = 'asc';
        searchQuery.value = '';
        categoryFilter.value = new Set();
        clearServerCache();
    });

    describe('Constants', () => {
        it('should have correct page size', () => {
            expect(SERVER_PAGE_SIZE).toBe(200);
        });

        it('should have correct large file threshold', () => {
            expect(LARGE_FILE_THRESHOLD).toBe(100000);
        });
    });

    describe('isParsing computed', () => {
        it('should be true when status is parsing', () => {
            currentSession.value = { status: 'parsing' } as ParseSession;
            expect(isParsing.value).toBe(true);
        });

        it('should be true when status is pending', () => {
            currentSession.value = { status: 'pending' } as ParseSession;
            expect(isParsing.value).toBe(true);
        });

        it('should be false when status is complete', () => {
            currentSession.value = { status: 'complete' } as ParseSession;
            expect(isParsing.value).toBe(false);
        });

        it('should be false when no session', () => {
            expect(isParsing.value).toBe(false);
        });
    });

    describe('useServerSide computed', () => {
        it('should be true for large files', () => {
            currentSession.value = {
                status: 'complete',
                entryCount: LARGE_FILE_THRESHOLD + 1
            } as ParseSession;
            expect(useServerSide.value).toBe(true);
        });

        it('should be false for small files', () => {
            currentSession.value = {
                status: 'complete',
                entryCount: 100
            } as ParseSession;
            expect(useServerSide.value).toBe(false);
        });

        it('should be false when entryCount is undefined', () => {
            currentSession.value = { status: 'complete' } as ParseSession;
            expect(useServerSide.value).toBe(false);
        });

        it('should be false when no session', () => {
            expect(useServerSide.value).toBe(false);
        });
    });

    describe('serverPageCache', () => {
        it('should store and retrieve cached entries', () => {
            const entries: LogEntry[] = [
                { deviceId: 'D1', signalName: 'S1', timestamp: 1000, value: true, signalType: 'boolean' }
            ];

            serverPageCache.set('1:{}', {
                page: 1,
                entries,
                timestamp: Date.now(),
                filterKey: '{}'
            });

            expect(serverPageCache.has('1:{}')).toBe(true);
            expect(serverPageCache.get('1:{}')?.entries).toEqual(entries);
        });

        it('should clear cache', () => {
            serverPageCache.set('test', { page: 1, entries: [], timestamp: 0, filterKey: '' });
            clearServerCache();
            expect(serverPageCache.size).toBe(0);
        });
    });
});
