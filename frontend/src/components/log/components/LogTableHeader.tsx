/**
 * LogTableHeader Component
 * 
 * Renders the table header with sortable columns and filter buttons.
 */
import { useState } from 'preact/hooks';
import { FilterIcon, ChevronUpIcon, ChevronDownIcon } from '../../icons';
import type { SortConfig } from '../utils/filterEngine';

export interface LogTableHeaderProps {
  /** Current sort configuration */
  sort: SortConfig;
  /** Callback when sort changes */
  onSort: (column: SortConfig['column']) => void;
  /** Available categories for filter */
  categories: string[];
  /** Selected categories */
  selectedCategories: Set<string>;
  /** Callback when category filter changes */
  onCategoryFilterChange: (categories: Set<string>) => void;
  /** Whether to show category filter */
  showCategoryFilter?: boolean;
}

/**
 * Table header with sortable columns
 */
export function LogTableHeader({
  sort,
  onSort,
  categories,
  selectedCategories,
  onCategoryFilterChange,
  showCategoryFilter = true
}: LogTableHeaderProps) {
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [filterButtonRect, setFilterButtonRect] = useState<DOMRect | null>(null);

  const toggleSort = (column: SortConfig['column']) => {
    if (sort.column === column) {
      // Toggle direction
      onSort(column);
    } else {
      // New column, start with ascending
      onSort(column);
    }
  };

  const renderSortIcon = (column: SortConfig['column']) => {
    if (sort.column !== column) {
      return <span className="sort-placeholder">↕</span>;
    }
    return sort.direction === 'asc' 
      ? <ChevronUpIcon className="sort-icon" />
      : <ChevronDownIcon className="sort-icon" />;
  };

  const handleToggleCategory = (category: string) => {
    const newSet = new Set(selectedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    onCategoryFilterChange(newSet);
  };

  const handleClearAllCategories = () => {
    onCategoryFilterChange(new Set());
  };

  const handleSelectAllCategories = () => {
    onCategoryFilterChange(new Set(categories));
  };

  const handleFilterClick = (e: MouseEvent) => {
    const button = e.currentTarget as HTMLButtonElement;
    setFilterButtonRect(button.getBoundingClientRect());
    setShowFilterPopover(!showFilterPopover);
  };

  const hasCategoryFilter = selectedCategories.size > 0;

  return (
    <div className="log-table-header" role="rowgroup">
      <div className="log-table-row header-row" role="row">
        {/* Timestamp column */}
        <div 
          className="log-table-cell col-timestamp sortable"
          role="columnheader"
          onClick={() => toggleSort('timestamp')}
        >
          <span>Timestamp</span>
          {renderSortIcon('timestamp')}
        </div>

        {/* Device column */}
        <div 
          className="log-table-cell col-device sortable"
          role="columnheader"
          onClick={() => toggleSort('deviceId')}
        >
          <span>Device</span>
          {renderSortIcon('deviceId')}
        </div>

        {/* Signal column */}
        <div 
          className="log-table-cell col-signal sortable"
          role="columnheader"
          onClick={() => toggleSort('signalName')}
        >
          <span>Signal</span>
          {renderSortIcon('signalName')}
        </div>

        {/* Value column */}
        <div 
          className="log-table-cell col-value sortable"
          role="columnheader"
          onClick={() => toggleSort('value')}
        >
          <span>Value</span>
          {renderSortIcon('value')}
        </div>

        {/* Type column */}
        <div 
          className="log-table-cell col-type sortable"
          role="columnheader"
          onClick={() => toggleSort('signalType')}
        >
          <span>Type</span>
          {renderSortIcon('signalType')}
        </div>

        {/* Category column with filter */}
        <div 
          className="log-table-cell col-category"
          role="columnheader"
        >
          <span>Category</span>
          {showCategoryFilter && (
            <button
              className={`filter-btn ${hasCategoryFilter ? 'active' : ''}`}
              onClick={handleFilterClick}
              aria-label="Filter categories"
              aria-pressed={hasCategoryFilter}
            >
              <FilterIcon />
              {hasCategoryFilter && (
                <span className="filter-badge">{selectedCategories.size}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter Popover */}
      {showFilterPopover && showCategoryFilter && (
        <CategoryFilterPopover
          categories={categories}
          selectedCategories={selectedCategories}
          onToggle={handleToggleCategory}
          onClearAll={handleClearAllCategories}
          onSelectAll={handleSelectAllCategories}
          onClose={() => setShowFilterPopover(false)}
          position={filterButtonRect ? {
            top: filterButtonRect.bottom + 5,
            left: filterButtonRect.left
          } : undefined}
        />
      )}
    </div>
  );
}

// Import needed for the popover
import { CategoryFilterPopover } from './CategoryFilterPopover';

export default LogTableHeader;
