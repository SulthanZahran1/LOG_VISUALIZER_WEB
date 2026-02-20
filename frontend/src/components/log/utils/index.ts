/**
 * Log Table Utilities
 * 
 * Pure functions for filtering, sorting, and processing log entries.
 */

export {
    filterEntries,
    sortEntries,
    hasActiveFilters,
    extractCategories,
    extractDevices,
    extractSignalTypes,
    highlightMatches,
    createServerFilter,
    debounceFilter
} from './filterEngine';

export type {
    FilterCriteria,
    SortConfig
} from './filterEngine';

export {
    computeRowColorCoding,
    entryMatchesSearch
} from './colorCoding';

export type {
    ColorCodingResult
} from './colorCoding';
