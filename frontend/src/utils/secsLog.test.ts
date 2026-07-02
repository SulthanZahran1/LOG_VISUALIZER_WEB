/**
 * Tests for SECS-II Log Type Utilities
 */
import { describe, it, expect } from 'vitest';
import {
    isSECSParser,
    isSECSFieldKey,
    parseSECSValue,
    getSECSFieldValue,
} from './secsLog';
import type { LogEntry } from '../models/types';

describe('isSECSParser', () => {
    it('returns true for secs_log parser', () => {
        expect(isSECSParser('secs_log')).toBe(true);
    });

    it('returns false for other parsers', () => {
        expect(isSECSParser('trs_log')).toBe(false);
        expect(isSECSParser('generic_log')).toBe(false);
        expect(isSECSParser('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isSECSParser(null)).toBe(false);
        expect(isSECSParser(undefined)).toBe(false);
    });
});

describe('isSECSFieldKey', () => {
    it('returns true for valid SECS field keys', () => {
        expect(isSECSFieldKey('direction')).toBe(true);
        expect(isSECSFieldKey('streamFunction')).toBe(true);
        expect(isSECSFieldKey('systemByte')).toBe(true);
        expect(isSECSFieldKey('messageBody')).toBe(true);
    });

    it('returns false for invalid field keys', () => {
        expect(isSECSFieldKey('cmdID')).toBe(false);
        expect(isSECSFieldKey('timestamp')).toBe(false);
        expect(isSECSFieldKey('')).toBe(false);
    });
});

describe('parseSECSValue', () => {
    const sampleJSON = JSON.stringify({
        timestamp: '2026-06-29T06:24:27.255Z',
        level: 'INFO',
        category: 'SECS_II',
        direction: 'SEND',
        stream: 6,
        function: 11,
        streamFunction: 'S6F11',
        waitBit: true,
        systemByte: 93052,
        ceid: 301,
        messageDesc: 'Event Report - CEID 301',
        body: {
            type: 'L',
            count: 3,
            name: 'L0',
            items: [
                { type: 'U2', count: 1, value: '0', name: 'DataID' },
                { type: 'U2', count: 1, value: '301', name: 'CEID' },
            ],
        },
    });

    it('parses JSON string value', () => {
        const result = parseSECSValue(sampleJSON);
        expect(result.direction).toBe('SEND');
        expect(result.streamFunction).toBe('S6F11');
        expect(result.systemByte).toBe(93052);
        expect(result.ceid).toBe(301);
        expect(result.messageDesc).toBe('Event Report - CEID 301');
        expect(result.body.type).toBe('L');
        expect(result.body.items).toHaveLength(2);
    });

    it('passes through already-parsed objects', () => {
        const obj = JSON.parse(sampleJSON);
        const result = parseSECSValue(obj);
        expect(result.direction).toBe('SEND');
        expect(result.streamFunction).toBe('S6F11');
    });

    it('returns defaults for invalid input', () => {
        const result = parseSECSValue('not-json');
        expect(result.direction).toBe('');
        expect(result.streamFunction).toBe('');
        expect(result.systemByte).toBe(0);
    });

    it('returns defaults for empty string', () => {
        const result = parseSECSValue('');
        expect(result.direction).toBe('');
        expect(result.streamFunction).toBe('');
    });

    it('handles RECV direction value correctly', () => {
        const recvJSON = JSON.stringify({
            direction: 'RECV',
            streamFunction: 'S2F49',
            systemByte: 93053,
            messageDesc: 'Ack',
            body: { type: 'L', count: 0 },
        });
        const result = parseSECSValue(recvJSON);
        expect(result.direction).toBe('RECV');
        expect(result.streamFunction).toBe('S2F49');
        expect(result.systemByte).toBe(93053);
    });

    it('handles numeric value (non-JSON fallback)', () => {
        const result = parseSECSValue(12345);
        expect(result.direction).toBe('');
        expect(result.streamFunction).toBe('');
    });
});

describe('getSECSFieldValue', () => {
    const sendEntry: Pick<LogEntry, 'value'> = {
        value: JSON.stringify({
            direction: 'SEND',
            streamFunction: 'S6F11',
            systemByte: 93052,
            messageDesc: 'Event Report',
            body: { type: 'L', count: 0 },
        }),
    };

    const recvEntry: Pick<LogEntry, 'value'> = {
        value: JSON.stringify({
            direction: 'RECV',
            streamFunction: 'S2F49',
            systemByte: 0,
            messageDesc: '',
            body: { type: 'L', count: 0 },
        }),
    };

    it('extracts direction field', () => {
        expect(getSECSFieldValue(sendEntry, 'direction')).toBe('SEND');
        expect(getSECSFieldValue(recvEntry, 'direction')).toBe('RECV');
    });

    it('extracts streamFunction field', () => {
        expect(getSECSFieldValue(sendEntry, 'streamFunction')).toBe('S6F11');
        expect(getSECSFieldValue(recvEntry, 'streamFunction')).toBe('S2F49');
    });

    it('extracts systemByte field', () => {
        expect(getSECSFieldValue(sendEntry, 'systemByte')).toBe('93052');
        expect(getSECSFieldValue(recvEntry, 'systemByte')).toBe('');
    });

    it('extracts messageBody field (messageDesc)', () => {
        expect(getSECSFieldValue(sendEntry, 'messageBody')).toBe('Event Report');
        expect(getSECSFieldValue(recvEntry, 'messageBody')).toBe('');
    });
});
