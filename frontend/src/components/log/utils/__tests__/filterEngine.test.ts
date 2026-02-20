import { describe, it, expect } from 'vitest';
import {
  filterEntries,
  sortEntries,
  hasActiveFilters,
  extractCategories,
  extractDevices,
  extractSignalTypes,
  highlightMatches
} from '../filterEngine';
import type { LogEntry } from '../../../../models/types';

describe('filterEngine', () => {
  const mockEntries: LogEntry[] = [
    { deviceId: 'PLC-01', signalName: 'MotorRunning', timestamp: 1000, value: true, signalType: 'boolean', category: 'System' },
    { deviceId: 'PLC-02', signalName: 'Temperature', timestamp: 2000, value: 42, signalType: 'integer', category: 'Sensor' },
    { deviceId: 'PLC-01', signalName: 'Status', timestamp: 3000, value: 'OK', signalType: 'string' },
    { deviceId: 'HMI-01', signalName: 'AlarmActive', timestamp: 4000, value: false, signalType: 'boolean', category: 'Alarm' },
  ];

  describe('hasActiveFilters', () => {
    it('returns false for empty criteria', () => {
      expect(hasActiveFilters({})).toBe(false);
    });

    it('returns true for search query', () => {
      expect(hasActiveFilters({ searchQuery: 'test' })).toBe(true);
    });

    it('returns true for showChangedOnly', () => {
      expect(hasActiveFilters({ showChangedOnly: true })).toBe(true);
    });

    it('returns true for categories', () => {
      expect(hasActiveFilters({ categories: new Set(['System']) })).toBe(true);
    });

    it('returns false for whitespace-only query', () => {
      expect(hasActiveFilters({ searchQuery: '   ' })).toBe(false);
    });
  });

  describe('filterEntries', () => {
    it('returns all entries when no filters', () => {
      const result = filterEntries(mockEntries, {});
      expect(result).toHaveLength(4);
    });

    it('filters by category', () => {
      const result = filterEntries(mockEntries, {
        categories: new Set(['System'])
      });
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('PLC-01');
    });

    it('filters by multiple categories', () => {
      const result = filterEntries(mockEntries, {
        categories: new Set(['System', 'Alarm'])
      });
      expect(result).toHaveLength(2);
    });

    it('filters by device', () => {
      const result = filterEntries(mockEntries, {
        devices: new Set(['PLC-01'])
      });
      expect(result).toHaveLength(2);
    });

    it('filters by signal type', () => {
      const result = filterEntries(mockEntries, {
        signalTypes: new Set(['boolean'])
      });
      expect(result).toHaveLength(2);
    });

    it('filters by search query (case insensitive)', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: 'plc'
      });
      expect(result).toHaveLength(3);
    });

    it('filters by search in signal name', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: 'motor'
      });
      expect(result).toHaveLength(1);
      expect(result[0].signalName).toBe('MotorRunning');
    });

    it('filters by search in value', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: '42'
      });
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(42);
    });

    it('filters with regex', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: '^PLC-0[12]$',
        useRegex: true
      });
      expect(result).toHaveLength(3);
    });

    it('handles invalid regex gracefully', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: '[invalid',
        useRegex: true
      });
      // Should not throw, just not match
      expect(Array.isArray(result)).toBe(true);
    });

    it('combines multiple filters', () => {
      const result = filterEntries(mockEntries, {
        categories: new Set(['System']),
        signalTypes: new Set(['boolean'])
      });
      expect(result).toHaveLength(1);
      expect(result[0].signalName).toBe('MotorRunning');
    });

    it('returns empty array when nothing matches', () => {
      const result = filterEntries(mockEntries, {
        searchQuery: 'nonexistent'
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('sortEntries', () => {
    it('sorts by timestamp ascending', () => {
      const result = sortEntries(mockEntries, { column: 'timestamp', direction: 'asc' });
      expect(result[0].timestamp).toBe(1000);
      expect(result[3].timestamp).toBe(4000);
    });

    it('sorts by timestamp descending', () => {
      const result = sortEntries(mockEntries, { column: 'timestamp', direction: 'desc' });
      expect(result[0].timestamp).toBe(4000);
      expect(result[3].timestamp).toBe(1000);
    });

    it('sorts by deviceId', () => {
      const result = sortEntries(mockEntries, { column: 'deviceId', direction: 'asc' });
      expect(result[0].deviceId).toBe('HMI-01');
      expect(result[1].deviceId).toBe('PLC-01');
    });

    it('sorts by signalName', () => {
      const result = sortEntries(mockEntries, { column: 'signalName', direction: 'asc' });
      const names = result.map(e => e.signalName);
      expect(names).toEqual(['AlarmActive', 'MotorRunning', 'Status', 'Temperature']);
    });

    it('sorts by signalType', () => {
      const result = sortEntries(mockEntries, { column: 'signalType', direction: 'asc' });
      expect(result[0].signalType).toBe('boolean');
      expect(result[3].signalType).toBe('string');
    });

    it('sorts by category', () => {
      const result = sortEntries(mockEntries, { column: 'category', direction: 'asc' });
      // Empty category comes first, then Alarm, Sensor, System
      expect(result[0].category).toBeUndefined();
    });

    it('does not mutate original array', () => {
      const original = [...mockEntries];
      sortEntries(mockEntries, { column: 'timestamp', direction: 'asc' });
      expect(mockEntries).toEqual(original);
    });
  });

  describe('extractCategories', () => {
    it('extracts unique categories', () => {
      const result = extractCategories(mockEntries);
      expect(result).toContain('System');
      expect(result).toContain('Sensor');
      expect(result).toContain('Alarm');
      expect(result).toContain('(Uncategorized)');
    });

    it('returns sorted categories', () => {
      const result = extractCategories(mockEntries);
      const sorted = [...result].sort();
      expect(result).toEqual(sorted);
    });

    it('handles empty array', () => {
      const result = extractCategories([]);
      expect(result).toEqual([]);
    });
  });

  describe('extractDevices', () => {
    it('extracts unique devices', () => {
      const result = extractDevices(mockEntries);
      expect(result).toEqual(['HMI-01', 'PLC-01', 'PLC-02']);
    });

    it('handles empty array', () => {
      const result = extractDevices([]);
      expect(result).toEqual([]);
    });
  });

  describe('extractSignalTypes', () => {
    it('extracts unique signal types', () => {
      const result = extractSignalTypes(mockEntries);
      expect(result).toContain('boolean');
      expect(result).toContain('integer');
      expect(result).toContain('string');
    });

    it('handles empty array', () => {
      const result = extractSignalTypes([]);
      expect(result).toEqual([]);
    });
  });

  describe('highlightMatches', () => {
    it('returns no match for empty query', () => {
      const result = highlightMatches('test text', '');
      expect(result.hasMatch).toBe(false);
    });

    it('detects match', () => {
      const result = highlightMatches('test text', 'test');
      expect(result.hasMatch).toBe(true);
    });

    it('detects match case insensitive', () => {
      const result = highlightMatches('Test Text', 'test', { caseSensitive: false });
      expect(result.hasMatch).toBe(true);
    });

    it('detects no match case sensitive', () => {
      const result = highlightMatches('Test Text', 'test', { caseSensitive: true });
      expect(result.hasMatch).toBe(false);
    });

    it('detects regex match', () => {
      const result = highlightMatches('test123', '^test', { useRegex: true });
      expect(result.hasMatch).toBe(true);
    });

    it('handles invalid regex', () => {
      const result = highlightMatches('test', '[invalid', { useRegex: true });
      expect(result.hasMatch).toBe(false);
    });
  });
});
