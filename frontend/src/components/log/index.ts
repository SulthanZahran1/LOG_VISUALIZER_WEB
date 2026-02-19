/**
 * Log Table Module
 * 
 * A virtualized, sortable, filterable log table with multi-select support.
 * 
 * @example
 * import { LogTable } from './components/log';
 * 
 * function MyComponent() {
 *   return <LogTable />;
 * }
 */

// Main component
export { LogTable } from './LogTable';
export { default } from './LogTable';

// Hooks
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

// Utilities
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

// Sub-components (for advanced usage)
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
