import { describe, expect, it } from 'vitest';
import { getTRSFieldValue, isTRSFieldKey, parseTRSValue } from './trsLog';

describe('trsLog utils', () => {
    it('parses packed TRS values into named fields', () => {
        expect(parseTRSValue('66749|COMPLETED|204501|105205|LOC-1|TR_SUCCESS')).toEqual({
            cmdID: '66749',
            status: 'COMPLETED',
            source: '204501',
            dest: '105205',
            currLoc: 'LOC-1',
            result: 'TR_SUCCESS',
        });
    });

    it('reads a specific TRS field from a log entry', () => {
        expect(getTRSFieldValue({ value: '66749|COMPLETED|204501|105205|LOC-1|TR_SUCCESS' }, 'dest')).toBe('105205');
    });

    it('recognizes TRS pseudo-columns', () => {
        expect(isTRSFieldKey('dest')).toBe(true);
        expect(isTRSFieldKey('timestamp')).toBe(false);
    });
});
