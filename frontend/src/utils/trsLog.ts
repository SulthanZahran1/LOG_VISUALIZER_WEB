import type { LogEntry } from '../models/types';

export type TRSFieldKey = 'cmdID' | 'status' | 'source' | 'dest' | 'currLoc' | 'result';

export interface TRSFields {
    cmdID: string;
    status: string;
    source: string;
    dest: string;
    currLoc: string;
    result: string;
}

const TRS_FIELD_ORDER: TRSFieldKey[] = ['cmdID', 'status', 'source', 'dest', 'currLoc', 'result'];

/** Parser names that produce pipe-delimited transfer log entries. */
const TRANSFER_PARSERS = new Set(['trs_log', 'stk_transfer']);

/** Returns true if the parser name produces transfer-format (pipe-delimited) entries. */
export function isTransferParser(parserName: string | undefined | null): boolean {
    return !!parserName && TRANSFER_PARSERS.has(parserName);
}

export function isTRSFieldKey(value: string): value is TRSFieldKey {
    return TRS_FIELD_ORDER.includes(value as TRSFieldKey);
}

export function parseTRSValue(value: unknown): TRSFields {
    const parts = String(value ?? '').split('|');

    return {
        cmdID: parts[0] || '',
        status: parts[1] || '',
        source: parts[2] || '',
        dest: parts[3] || '',
        currLoc: parts[4] || '',
        result: parts[5] || '',
    };
}

export function getTRSFieldValue(entry: Pick<LogEntry, 'value'>, field: TRSFieldKey): string {
    return parseTRSValue(entry.value)[field];
}
