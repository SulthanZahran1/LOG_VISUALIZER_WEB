/**
 * SECS-II Log Type Utilities
 *
 * Utilities for parsing and working with SECS-II (SEMI Equipment Communications Standard)
 * log entries. SECS-II messages are stored as JSON in the LogEntry.value field.
 */
import type { LogEntry } from '../models/types';

export type SECSFieldKey = 'direction' | 'streamFunction' | 'systemByte' | 'messageBody';

export interface SECSMessageData {
    timestamp: string;
    level: string;
    category: string;
    direction: string;
    stream: number;
    function: number;
    streamFunction: string;
    waitBit: boolean;
    systemByte: number;
    ceid?: number;
    messageDesc: string;
    body: SECSNode;
}

export interface SECSNode {
    type: string;
    count: number;
    value?: string;
    name?: string;
    items?: SECSNode[];
}

const SECS_FIELD_ORDER: SECSFieldKey[] = ['direction', 'streamFunction', 'systemByte', 'messageBody'];

/** Parser name that produces SECS-II JSON-encoded log entries. */
const SECS_PARSER = 'secs_log';

/** Returns true if the parser name produces SECS-II format entries. */
export function isSECSParser(parserName: string | undefined | null): boolean {
    return !!parserName && parserName === SECS_PARSER;
}

/** Type guard for SECS field keys. */
export function isSECSFieldKey(value: string): value is SECSFieldKey {
    return SECS_FIELD_ORDER.includes(value as SECSFieldKey);
}

/**
 * Parse a SECS-II message value stored as JSON string (or already-parsed object).
 */
export function parseSECSValue(value: unknown): SECSMessageData {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as SECSMessageData;
        } catch {
            // Return defaults if parsing fails
        }
    }
    if (value && typeof value === 'object') {
        return value as SECSMessageData;
    }
    return {
        timestamp: '',
        level: '',
        category: '',
        direction: '',
        stream: 0,
        function: 0,
        streamFunction: '',
        waitBit: false,
        systemByte: 0,
        messageDesc: '',
        body: { type: '', count: 0 },
    };
}

/**
 * Extract a specific SECS field value from a log entry.
 */
export function getSECSFieldValue(entry: Pick<LogEntry, 'value'>, field: SECSFieldKey): string {
    const msg = parseSECSValue(entry.value);
    switch (field) {
        case 'direction':
            return msg.direction || '';
        case 'streamFunction':
            return msg.streamFunction || '';
        case 'systemByte':
            return msg.systemByte ? String(msg.systemByte) : '';
        case 'messageBody':
            return msg.messageDesc || '';
        default:
            return '';
    }
}

export default {
    isSECSParser,
    isSECSFieldKey,
    parseSECSValue,
    getSECSFieldValue,
};
