/**
 * Log Table Module
 * 
 * Week 2 Refactoring Components (Ready for integration)
 * 
 * These hooks and utilities are fully tested and ready to be integrated
 * into the main LogTable component.
 */

// Hooks (from Week 2 refactoring)
export {
  useVirtualScroll,
  useRowSelection
} from './hooks';

export type {
  VirtualScrollConfig,
  VirtualScrollState,
  VirtualScrollActions,
  RowSelectionState,
  RowSelectionActions
} from './hooks';

// Utilities (from Week 2 refactoring)
export {
  filterEntries,
  sortEntries,
  hasActiveFilters,
  extractCategories,
  extractDevices,
  extractSignalTypes,
  highlightMatches
} from './utils';

export type {
  FilterCriteria,
  SortConfig
} from './utils';

// Sub-components (from Week 2 refactoring - for advanced usage)
// Note: These are not yet integrated into the main LogTable
export {
  LogTableRow,
  CategoryFilterPopover,
  LogTableHeader,
  LogTableBody,
  SelectionToolbar
} from './components';

export type {
  LogTableRowProps,
  CategoryFilterPopoverProps,
  LogTableHeaderProps,
  LogTableBodyProps,
  SelectionToolbarProps
} from './components';

// Note: Main LogTable component is in ./LogTable.tsx (original version)
// Week 2 integration will merge these new hooks/components into it
