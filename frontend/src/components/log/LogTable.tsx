/**
 * LogTable Component (Refactored)
 * 
 * A virtualized, sortable, filterable log table with multi-select support.
 * 
 * Architecture:
 * - Uses useVirtualScroll for performance with large datasets
 * - Uses useRowSelection for multi-select with keyboard modifiers
 * - Delegates rendering to sub-components
 * - Integrates with logStore for data
 */
import { useCallback, useMemo, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';

// Store imports
import {
  filteredEntries,
  isLoadingLog,
  useServerSide,
  totalEntries,
  sortColumn,
  sortDirection,
  categoryFilter,
  availableCategories,
  fetchEntries,
  jumpToTime
} from '../../stores/logStore';

// Hooks
import { useVirtualScroll } from './hooks/useVirtualScroll';
import { useRowSelection } from './hooks/useRowSelection';

// Utilities
import { extractCategories } from './utils/filterEngine';
import type { SortConfig } from './utils/filterEngine';

// Components
import { LogTableHeader } from './components/LogTableHeader';
import { LogTableBody } from './components/LogTableBody';
import { SelectionToolbar } from './components/SelectionToolbar';

// Styles
import './LogTable.css';

// Constants
const ROW_HEIGHT = 28;
const BUFFER = 15;
const CONTAINER_HEIGHT = 600;
const SERVER_PAGE_SIZE = 200;

/**
 * Main LogTable component
 * Container that orchestrates hooks and sub-components
 */
export function LogTable() {
  // Get store data
  const entries = useSignal(filteredEntries);
  const loading = useSignal(isLoadingLog);
  const serverSide = useSignal(useServerSide);
  const total = useSignal(totalEntries);
  const currentSortColumn = useSignal(sortColumn);
  const currentSortDirection = useSignal(sortDirection);
  const categories = useSignal(availableCategories);
  const selectedCategories = useSignal(categoryFilter);

  // Virtual scroll hook
  const { 
    state: scrollState, 
    actions: scrollActions, 
    containerRef 
  } = useVirtualScroll({
    rowHeight: ROW_HEIGHT,
    buffer: BUFFER,
    totalItems: serverSide.value ? total.value : entries.value.length,
    containerHeight: CONTAINER_HEIGHT,
    serverSide: serverSide.value,
    pageSize: SERVER_PAGE_SIZE
  });

  // Row selection hook
  const { state: selectionState, actions: selectionActions } = useRowSelection();

  // Handle sort
  const handleSort = useCallback((column: SortConfig['column']) => {
    // Toggle direction if same column
    const newDirection = 
      currentSortColumn.value === column && currentSortDirection.value === 'asc'
        ? 'desc'
        : 'asc';
    
    sortColumn.value = column;
    sortDirection.value = newDirection;
  }, []);

  // Handle category filter
  const handleCategoryFilterChange = useCallback((newFilter: Set<string>) => {
    categoryFilter.value = newFilter;
  }, []);

  // Handle copy
  const handleCopy = useCallback(() => {
    const selectedData = selectionActions.getSelectedData(entries.value);
    const text = selectedData.map(entry => 
      `${entry.timestamp},${entry.deviceId},${entry.signalName},${entry.value}`
    ).join('\n');
    
    navigator.clipboard.writeText(text).catch(console.error);
  }, [entries.value, selectionActions]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    selectionActions.clearSelection();
  }, [selectionActions]);

  // Get visible entries
  const visibleEntries = useMemo(() => {
    if (serverSide.value) {
      // Trigger fetch for visible range
      const startOffset = scrollState.startIndex;
      const limit = scrollState.endIndex - scrollState.startIndex;
      fetchEntries(startOffset, limit);
      return entries.value;
    }
    return entries.value.slice(scrollState.startIndex, scrollState.endIndex);
  }, [
    entries.value, 
    scrollState.startIndex, 
    scrollState.endIndex, 
    serverSide.value
  ]);

  // Get categories for filter
  const filterCategories = useMemo(() => {
    if (categories.value.length > 0) {
      return categories.value;
    }
    return extractCategories(entries.value);
  }, [categories.value, entries.value]);

  // Keyboard shortcut for copy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectionState.hasSelection) {
        e.preventDefault();
        handleCopy();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectionState.hasSelection, handleCopy]);

  // Render
  return (
    <div 
      className="log-table-container"
      data-testid="log-table-container"
    >
      {/* Selection toolbar */}
      {selectionState.hasSelection && (
        <SelectionToolbar
          selectedCount={selectionState.selectionCount}
          onCopy={handleCopy}
          onClear={handleClearSelection}
        />
      )}

      {/* Table header */}
      <LogTableHeader
        sort={{
          column: currentSortColumn.value,
          direction: currentSortDirection.value
        }}
        onSort={handleSort}
        categories={filterCategories}
        selectedCategories={selectedCategories.value}
        onCategoryFilterChange={handleCategoryFilterChange}
      />

      {/* Table body */}
      <LogTableBody
        ref={containerRef}
        entries={visibleEntries}
        startIndex={scrollState.startIndex}
        scrollHeight={scrollState.scrollHeight}
        offsetY={scrollState.offsetY}
        rowHeight={ROW_HEIGHT}
        selectedRows={selectionState.selectedRows}
        onRowClick={selectionActions.handleRowClick}
        onScroll={scrollActions.onScroll}
        isLoading={loading.value}
      />
    </div>
  );
}

export default LogTable;
