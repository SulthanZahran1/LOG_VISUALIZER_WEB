/**
 * Filter Engine
 * 
 * Pure functions for filtering and searching log entries.
 * All functions are stateless and testable.
 */
import type { LogEntry } from '../../../models/types';

export interface FilterCriteria {
  /** Search query string */
  searchQuery?: string;
  /** Use regex for search */
  useRegex?: boolean;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Show only entries where value changed */
  showChangedOnly?: boolean;
  /** Filter by categories */
  categories?: Set<string>;
  /** Filter by devices */
  devices?: Set<string>;
  /** Filter by signal types */
  signalTypes?: Set<string>;
}

export interface SortConfig {
  /** Column to sort by */
  column: 'timestamp' | 'deviceId' | 'signalName' | 'value' | 'signalType' | 'category';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(criteria: FilterCriteria): boolean {
  if (criteria.searchQuery?.trim()) return true;
  if (criteria.showChangedOnly) return true;
  if (criteria.categories && criteria.categories.size > 0) return true;
  if (criteria.devices && criteria.devices.size > 0) return true;
  if (criteria.signalTypes && criteria.signalTypes.size > 0) return true;
  return false;
}

/**
 * Filter entries based on criteria
 */
export function filterEntries(
  entries: LogEntry[],
  criteria: FilterCriteria
): LogEntry[] {
  if (!hasActiveFilters(criteria)) {
    return entries;
  }

  return entries.filter(entry => matchesCriteria(entry, criteria));
}

/**
 * Check if entry matches all criteria
 */
function matchesCriteria(entry: LogEntry, criteria: FilterCriteria): boolean {
  // Category filter
  if (criteria.categories && criteria.categories.size > 0) {
    const category = entry.category ?? '';
    if (!criteria.categories.has(category)) {
      return false;
    }
  }

  // Device filter
  if (criteria.devices && criteria.devices.size > 0) {
    if (!criteria.devices.has(entry.deviceId)) {
      return false;
    }
  }

  // Signal type filter
  if (criteria.signalTypes && criteria.signalTypes.size > 0) {
    if (!criteria.signalTypes.has(entry.signalType)) {
      return false;
    }
  }

  // Search filter
  if (criteria.searchQuery?.trim()) {
    if (!matchesSearch(entry, criteria)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if entry matches search query
 */
function matchesSearch(entry: LogEntry, criteria: FilterCriteria): boolean {
  const { searchQuery, useRegex, caseSensitive } = criteria;
  if (!searchQuery?.trim()) return true;

  const query = caseSensitive ? searchQuery : searchQuery.toLowerCase();
  
  const fields = [
    entry.deviceId,
    entry.signalName,
    String(entry.value),
    entry.category
  ].filter((f): f is string => f !== undefined);

  if (useRegex) {
    try {
      const flags = caseSensitive ? '' : 'i';
      const regex = new RegExp(query, flags);
      return fields.some(field => regex.test(String(field)));
    } catch {
      // Invalid regex, fall back to string includes
      return fields.some(field => 
        String(field).toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  return fields.some(field => {
    const fieldStr = caseSensitive ? String(field) : String(field).toLowerCase();
    return fieldStr.includes(query);
  });
}

/**
 * Sort entries based on configuration
 */
export function sortEntries(
  entries: LogEntry[],
  sort: SortConfig
): LogEntry[] {
  return [...entries].sort((a, b) => {
    let comparison = 0;

    switch (sort.column) {
      case 'timestamp':
        comparison = a.timestamp - b.timestamp;
        break;
      case 'deviceId':
        comparison = a.deviceId.localeCompare(b.deviceId);
        break;
      case 'signalName':
        comparison = a.signalName.localeCompare(b.signalName);
        break;
      case 'value':
        comparison = String(a.value).localeCompare(String(b.value));
        break;
      case 'signalType':
        comparison = a.signalType.localeCompare(b.signalType);
        break;
      case 'category':
        comparison = (a.category ?? '').localeCompare(b.category ?? '');
        break;
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });
}

/**
 * Extract unique categories from entries
 */
export function extractCategories(entries: LogEntry[]): string[] {
  const categories = new Set<string>();
  entries.forEach(entry => {
    categories.add(entry.category ?? '(Uncategorized)');
  });
  return Array.from(categories).sort();
}

/**
 * Extract unique devices from entries
 */
export function extractDevices(entries: LogEntry[]): string[] {
  const devices = new Set<string>();
  entries.forEach(entry => {
    devices.add(entry.deviceId);
  });
  return Array.from(devices).sort();
}

/**
 * Extract unique signal types from entries
 */
export function extractSignalTypes(entries: LogEntry[]): string[] {
  const types = new Set<string>();
  entries.forEach(entry => {
    types.add(entry.signalType);
  });
  return Array.from(types).sort();
}

/**
 * Highlight search matches in text
 */
export function highlightMatches(
  text: string,
  searchQuery: string,
  options: { useRegex?: boolean; caseSensitive?: boolean } = {}
): { text: string; hasMatch: boolean } {
  if (!searchQuery.trim()) {
    return { text, hasMatch: false };
  }

  const { useRegex, caseSensitive } = options;
  
  try {
    let regex: RegExp;
    
    if (useRegex) {
      const flags = caseSensitive ? '' : 'i';
      regex = new RegExp(`(${searchQuery})`, flags);
    } else {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = caseSensitive ? '' : 'i';
      regex = new RegExp(`(${escaped})`, flags);
    }

    const hasMatch = regex.test(text);
    // Note: Actual highlighting would be done by component with JSX
    // This function just identifies matches
    return { text, hasMatch };
  } catch {
    // Invalid regex
    return { text, hasMatch: false };
  }
}

/**
 * Create a filter function for server-side filtering
 */
export function createServerFilter(criteria: FilterCriteria): (entry: LogEntry) => boolean {
  return (entry: LogEntry) => matchesCriteria(entry, criteria);
}

/**
 * Debounce filter changes
 */
export function debounceFilter<T>(
  filterFn: (items: T[], criteria: FilterCriteria) => T[],
  delay: number = 150
): (items: T[], criteria: FilterCriteria) => Promise<T[]> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (items: T[], criteria: FilterCriteria): Promise<T[]> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        resolve(filterFn(items, criteria));
      }, delay);
    });
  };
}

export default {
  filterEntries,
  sortEntries,
  hasActiveFilters,
  extractCategories,
  extractDevices,
  extractSignalTypes,
  highlightMatches,
  createServerFilter,
  debounceFilter
};
