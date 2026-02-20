# Implementation Guide: LogTable Component Refactoring

> **Target**: Decompose `LogTable.tsx` (1,160 lines) into maintainable pieces  
> **Estimated Time**: 2-3 days  
> **Test Coverage Goal**: 75%+

---

## Current State Analysis

### LogTable.tsx Structure
```typescript
// Current: 1,160 lines with mixed concerns
export function LogTable() {
    // 1. Virtual scroll calculations (100+ lines)
    // 2. Row selection logic (80+ lines)
    // 3. Server-side fetching logic (60+ lines)
    // 4. Keyboard navigation (40+ lines)
    // 5. Category filter popover (150+ lines - inline component!)
    // 6. JSX rendering (400+ lines)
}

// Problems:
// - 223-line main component function
// - CategoryFilterPopover defined INSIDE LogTable
// - Inline styles scattered throughout
// - Complex useEffect chains
// - No separation between logic and presentation
```

### Issues Identified
1. **Single responsibility violation**: Does virtual scroll, filtering, selection, UI
2. **Performance**: Re-renders entire component on scroll
3. **Testability**: Can't test logic without rendering full component
4. **Maintainability**: 223-line function is hard to understand
5. **Reusability**: Can't reuse virtual scroll logic elsewhere

---

## Target Architecture

### Directory Structure
```
frontend/src/components/log/
├── LogTable.tsx                      # ~120 lines - Container only
├── LogTable.css                      # Existing styles
├── index.ts                          # Public exports
│
├── hooks/                            # Extracted logic
│   ├── index.ts
│   ├── useVirtualScroll.ts           # Virtual scrolling
│   ├── useRowSelection.ts            # Multi-select logic
│   ├── useKeyboardNavigation.ts      # Keyboard shortcuts
│   ├── useColumnResize.ts            # Column resizing
│   └── useLogTableState.ts           # Combined hook (convenience)
│
├── components/                       # Sub-components
│   ├── index.ts
│   ├── LogTableHeader.tsx            # Table headers with filters
│   ├── LogTableRow.tsx               # Single row renderer
│   ├── LogTableCell.tsx              # Cell with color coding
│   ├── LogTableBody.tsx              # Virtualized body
│   ├── CategoryFilterPopover.tsx     # Extracted popover
│   ├── SearchHighlight.tsx           # Highlight matched text
│   ├── SelectionToolbar.tsx          # Copy/selection toolbar
│   └── EmptyState.tsx                # No data state
│
├── utils/                            # Pure functions
│   ├── index.ts
│   ├── rowCalculator.ts              # Virtual row math
│   ├── filterEngine.ts               # Filter logic
│   ├── sorter.ts                     # Sorting logic
│   └── colorCoder.ts                 # Color coding logic
│
└── __tests__/                        # Tests
    ├── LogTable.test.tsx
    ├── hooks.test.ts
    ├── components.test.tsx
    └── utils.test.ts
```

---

## Step-by-Step Implementation

### Step 1: Create Virtual Scroll Hook

```typescript
// frontend/src/components/log/hooks/useVirtualScroll.ts
import { useState, useCallback, useMemo, useRef } from 'preact/hooks';

export interface VirtualScrollConfig {
    /** Height of each row in pixels */
    rowHeight: number;
    /** Number of buffer rows above/below viewport */
    buffer: number;
    /** Total number of items */
    totalItems: number;
    /** Height of the container */
    containerHeight: number;
    /** Enable server-side mode */
    serverSide?: boolean;
    /** Page size for server-side fetching */
    pageSize?: number;
}

export interface VirtualScrollState {
    /** Index of first visible item */
    startIndex: number;
    /** Index of last visible item */
    endIndex: number;
    /** Vertical offset for positioning */
    offsetY: number;
    /** Total scroll height */
    scrollHeight: number;
    /** Current scroll top */
    scrollTop: number;
    /** Scale factor for server-side */
    scaleFactor: number;
}

export interface VirtualScrollActions {
    /** Handle scroll event */
    onScroll: (scrollTop: number) => void;
    /** Scroll to specific index */
    scrollToIndex: (index: number) => void;
    /** Scroll to offset */
    scrollToOffset: (offset: number) => void;
    /** Get item style for positioning */
    getItemStyle: (index: number) => React.CSSProperties;
}

const MAX_SCROLL_HEIGHT = 15_000_000; // Browser safe limit

/**
 * Hook for virtualized scrolling with buffer support
 * 
 * @example
 * const { state, onScroll } = useVirtualScroll({
 *   rowHeight: 28,
 *   buffer: 5,
 *   totalItems: 100000,
 *   containerHeight: 600
 * });
 */
export function useVirtualScroll(config: VirtualScrollConfig): {
    state: VirtualScrollState;
    actions: VirtualScrollActions;
    containerRef: React.RefObject<HTMLDivElement>;
} {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    // Calculate scale factor for server-side mode
    const scaleFactor = useMemo(() => {
        if (!config.serverSide) return 1;
        const realHeight = config.totalItems * config.rowHeight;
        if (realHeight <= MAX_SCROLL_HEIGHT) return 1;
        return realHeight / MAX_SCROLL_HEIGHT;
    }, [config.serverSide, config.totalItems, config.rowHeight]);

    // Calculate visible range
    const { startIndex, endIndex, offsetY, scrollHeight } = useMemo(() => {
        const realScrollTop = scrollTop * scaleFactor;
        const start = Math.max(0, Math.floor(realScrollTop / config.rowHeight) - config.buffer);
        const visibleCount = Math.ceil(config.containerHeight / config.rowHeight);
        const end = Math.min(config.totalItems, start + visibleCount + config.buffer * 2);
        
        return {
            startIndex: start,
            endIndex: end,
            offsetY: start * config.rowHeight,
            scrollHeight: config.serverSide 
                ? Math.min(config.totalItems * config.rowHeight / scaleFactor, MAX_SCROLL_HEIGHT)
                : config.totalItems * config.rowHeight
        };
    }, [scrollTop, config, scaleFactor]);

    const onScroll = useCallback((newScrollTop: number) => {
        setScrollTop(newScrollTop);
    }, []);

    const scrollToIndex = useCallback((index: number) => {
        const offset = index * config.rowHeight / scaleFactor;
        containerRef.current?.scrollTo({ top: offset, behavior: 'smooth' });
    }, [config.rowHeight, scaleFactor]);

    const scrollToOffset = useCallback((offset: number) => {
        containerRef.current?.scrollTo({ top: offset / scaleFactor, behavior: 'smooth' });
    }, [scaleFactor]);

    const getItemStyle = useCallback((index: number): React.CSSProperties => ({
        position: 'absolute',
        top: index * config.rowHeight,
        height: config.rowHeight,
        left: 0,
        right: 0,
    }), [config.rowHeight]);

    return {
        state: {
            startIndex,
            endIndex,
            offsetY,
            scrollHeight,
            scrollTop,
            scaleFactor
        },
        actions: {
            onScroll,
            scrollToIndex,
            scrollToOffset,
            getItemStyle
        },
        containerRef
    };
}

export default useVirtualScroll;
```

**Test for useVirtualScroll**:

```typescript
// frontend/src/components/log/__tests__/hooks.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useVirtualScroll } from '../hooks/useVirtualScroll';

describe('useVirtualScroll', () => {
    const defaultConfig = {
        rowHeight: 28,
        buffer: 5,
        totalItems: 1000,
        containerHeight: 300
    };

    it('calculates initial state correctly', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        expect(result.current.state.startIndex).toBe(0);
        expect(result.current.state.endIndex).toBe(21); // visible + buffer
        expect(result.current.state.offsetY).toBe(0);
        expect(result.current.state.scrollHeight).toBe(28000);
    });

    it('updates visible range on scroll', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        act(() => {
            result.current.actions.onScroll(1000);
        });

        expect(result.current.state.scrollTop).toBe(1000);
        expect(result.current.state.startIndex).toBe(30); // (1000/28) - 5 buffer
    });

    it('handles server-side mode with scaling', () => {
        const config = { ...defaultConfig, serverSide: true, totalItems: 1000000 };
        const { result } = renderHook(() => useVirtualScroll(config));
        
        expect(result.current.state.scaleFactor).toBeGreaterThan(1);
        expect(result.current.state.scrollHeight).toBeLessThanOrEqual(15000000);
    });

    it('calculates item style correctly', () => {
        const { result } = renderHook(() => useVirtualScroll(defaultConfig));
        
        const style = result.current.actions.getItemStyle(10);
        expect(style.top).toBe(280);
        expect(style.height).toBe(28);
    });
});
```

### Step 2: Create Row Selection Hook

```typescript
// frontend/src/components/log/hooks/useRowSelection.ts
import { useState, useCallback } from 'preact/hooks';

export interface RowSelectionState {
    /** Set of selected row indices */
    selectedRows: Set<number>;
    /** Last clicked row for shift-select */
    lastClickedRow: number | null;
    /** Whether any rows are selected */
    hasSelection: boolean;
    /** Count of selected rows */
    selectionCount: number;
}

export interface RowSelectionActions {
    /** Toggle single row selection */
    toggleRow: (index: number) => void;
    /** Select single row (deselects others) */
    selectRow: (index: number) => void;
    /** Range select from last clicked to this row */
    selectRange: (endIndex: number) => void;
    /** Select all rows */
    selectAll: (totalCount: number) => void;
    /** Clear all selections */
    clearSelection: () => void;
    /** Check if row is selected */
    isSelected: (index: number) => boolean;
    /** Get selected indices as sorted array */
    getSelectedIndices: () => number[];
}

/**
 * Hook for multi-row selection with shift-click support
 */
export function useRowSelection(): {
    state: RowSelectionState;
    actions: RowSelectionActions;
} {
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [lastClickedRow, setLastClickedRow] = useState<number | null>(null);

    const toggleRow = useCallback((index: number) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
        setLastClickedRow(index);
    }, []);

    const selectRow = useCallback((index: number) => {
        setSelectedRows(new Set([index]));
        setLastClickedRow(index);
    }, []);

    const selectRange = useCallback((endIndex: number) => {
        if (lastClickedRow === null) {
            selectRow(endIndex);
            return;
        }

        const start = Math.min(lastClickedRow, endIndex);
        const end = Math.max(lastClickedRow, endIndex);
        
        setSelectedRows(prev => {
            const next = new Set(prev);
            for (let i = start; i <= end; i++) {
                next.add(i);
            }
            return next;
        });
    }, [lastClickedRow, selectRow]);

    const selectAll = useCallback((totalCount: number) => {
        const allIndices = Array.from({ length: totalCount }, (_, i) => i);
        setSelectedRows(new Set(allIndices));
        setLastClickedRow(null);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedRows(new Set());
        setLastClickedRow(null);
    }, []);

    const isSelected = useCallback((index: number) => {
        return selectedRows.has(index);
    }, [selectedRows]);

    const getSelectedIndices = useCallback(() => {
        return Array.from(selectedRows).sort((a, b) => a - b);
    }, [selectedRows]);

    return {
        state: {
            selectedRows,
            lastClickedRow,
            hasSelection: selectedRows.size > 0,
            selectionCount: selectedRows.size
        },
        actions: {
            toggleRow,
            selectRow,
            selectRange,
            selectAll,
            clearSelection,
            isSelected,
            getSelectedIndices
        }
    };
}

export default useRowSelection;
```

### Step 3: Create Filter Engine

```typescript
// frontend/src/components/log/utils/filterEngine.ts
import type { LogEntry } from '../../../models/types';

export interface FilterCriteria {
    searchQuery?: string;
    useRegex?: boolean;
    caseSensitive?: boolean;
    showChangedOnly?: boolean;
    categories?: Set<string>;
}

/**
 * Pure function to filter log entries
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

function hasActiveFilters(criteria: FilterCriteria): boolean {
    if (criteria.searchQuery?.trim()) return true;
    if (criteria.showChangedOnly) return true;
    if (criteria.categories && criteria.categories.size > 0) return true;
    return false;
}

function matchesCriteria(entry: LogEntry, criteria: FilterCriteria): boolean {
    // Category filter
    if (criteria.categories && criteria.categories.size > 0) {
        const category = entry.category ?? '';
        if (!criteria.categories.has(category)) {
            return false;
        }
    }

    // Search filter
    if (criteria.searchQuery?.trim()) {
        if (!matchesSearch(entry, criteria)) {
            return false;
        }
    }

    // Changed only filter (handled at store level with state tracking)
    
    return true;
}

function matchesSearch(entry: LogEntry, criteria: FilterCriteria): boolean {
    const { searchQuery, useRegex, caseSensitive } = criteria;
    const query = caseSensitive ? searchQuery! : searchQuery!.toLowerCase();
    
    const fields = [
        entry.deviceId,
        entry.signalName,
        String(entry.value),
        entry.category
    ].filter(Boolean);

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
 * Get unique categories from entries
 */
export function extractCategories(entries: LogEntry[]): string[] {
    const categories = new Set<string>();
    entries.forEach(entry => {
        categories.add(entry.category ?? '(Uncategorized)');
    });
    return Array.from(categories).sort();
}

export default filterEntries;
```

### Step 4: Create Sub-Components

```typescript
// frontend/src/components/log/components/LogTableRow.tsx
import { memo } from 'preact/compat';
import { formatDateTime } from '../../../utils/TimeAxisUtils';
import type { LogEntry } from '../../../models/types';
import { LogTableCell } from './LogTableCell';

export interface LogTableRowProps {
    entry: LogEntry;
    index: number;
    isSelected: boolean;
    isEven: boolean;
    style: React.CSSProperties;
    onClick: (e: MouseEvent, index: number) => void;
    searchQuery?: string;
    searchHighlightMode?: boolean;
}

export const LogTableRow = memo(function LogTableRow({
    entry,
    index,
    isSelected,
    isEven,
    style,
    onClick,
    searchQuery,
    searchHighlightMode
}: LogTableRowProps) {
    const handleClick = (e: MouseEvent) => {
        onClick(e, index);
    };

    const rowClass = [
        'log-table-row',
        isSelected && 'selected',
        isEven && 'even'
    ].filter(Boolean).join(' ');

    return (
        <div
            className={rowClass}
            style={style}
            onClick={handleClick}
            data-index={index}
            data-testid={`log-row-${index}`}
        >
            <LogTableCell className="col-timestamp">
                {formatDateTime(entry.timestamp)}
            </LogTableCell>
            <LogTableCell className="col-device">
                {entry.deviceId}
            </LogTableCell>
            <LogTableCell className="col-signal">
                {entry.signalName}
            </LogTableCell>
            <LogTableCell className="col-value">
                {String(entry.value)}
            </LogTableCell>
            <LogTableCell className="col-type">
                {entry.signalType}
            </LogTableCell>
            <LogTableCell className="col-category">
                {entry.category}
            </LogTableCell>
        </div>
    );
});

export default LogTableRow;
```

```typescript
// frontend/src/components/log/components/CategoryFilterPopover.tsx
import { useState, useRef, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { SearchIcon, CloseIcon } from '../../icons';

export interface CategoryFilterPopoverProps {
    categories: string[];
    selectedCategories: Set<string>;
    onToggle: (category: string) => void;
    onClearAll: () => void;
    onSelectAll: () => void;
    onClose: () => void;
}

export function CategoryFilterPopover({
    categories,
    selectedCategories,
    onToggle,
    onClearAll,
    onSelectAll,
    onClose
}: CategoryFilterPopoverProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const popoverRef = useRef<HTMLDivElement>(null);

    // Filter categories by search
    const filteredCategories = searchQuery.trim() === ''
        ? categories
        : categories.filter(cat =>
            cat.toLowerCase().includes(searchQuery.toLowerCase())
        );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return (
        <div ref={popoverRef} className="category-filter-popover">
            <div className="popover-header">
                <h4>Filter Categories</h4>
                <button onClick={onClose} className="close-btn">
                    <CloseIcon />
                </button>
            </div>
            
            <div className="popover-search">
                <SearchIcon />
                <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                />
            </div>

            <div className="popover-actions">
                <button onClick={onSelectAll}>Select All</button>
                <button onClick={onClearAll}>Clear All</button>
            </div>

            <div className="popover-list">
                {filteredCategories.map(category => (
                    <label key={category} className="category-item">
                        <input
                            type="checkbox"
                            checked={selectedCategories.has(category)}
                            onChange={() => onToggle(category)}
                        />
                        <span>{category}</span>
                        <span className="count">
                            {selectedCategories.has(category) ? '✓' : ''}
                        </span>
                    </label>
                ))}
                {filteredCategories.length === 0 && (
                    <div className="no-results">No categories found</div>
                )}
            </div>
        </div>
    );
}

export default CategoryFilterPopover;
```

### Step 5: Refactored LogTable Component

```typescript
// frontend/src/components/log/LogTable.tsx
import { useCallback, useMemo } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { 
    filteredEntries, 
    isLoadingLog,
    useServerSide,
    totalEntries,
    fetchEntries
} from '../../stores/logStore';
import { useVirtualScroll } from './hooks/useVirtualScroll';
import { useRowSelection } from './hooks/useRowSelection';
import { LogTableHeader } from './components/LogTableHeader';
import { LogTableBody } from './components/LogTableBody';
import { SelectionToolbar } from './components/SelectionToolbar';
import { filterEntries, extractCategories } from './utils/filterEngine';
import './LogTable.css';

const ROW_HEIGHT = 28;
const BUFFER = 15;
const CONTAINER_HEIGHT = 600; // Could be dynamic

export function LogTable() {
    // Get store data
    const entries = useSignal(filteredEntries);
    const loading = useSignal(isLoadingLog);
    const serverSide = useSignal(useServerSide);
    const total = useSignal(totalEntries);

    // Virtual scroll hook
    const { state: scrollState, actions: scrollActions, containerRef } = useVirtualScroll({
        rowHeight: ROW_HEIGHT,
        buffer: BUFFER,
        totalItems: serverSide.value ? total.value : entries.value.length,
        containerHeight: CONTAINER_HEIGHT,
        serverSide: serverSide.value,
        pageSize: 200
    });

    // Row selection hook
    const { state: selectionState, actions: selectionActions } = useRowSelection();

    // Handle row click
    const handleRowClick = useCallback((e: MouseEvent, index: number) => {
        if (e.shiftKey) {
            selectionActions.selectRange(index);
        } else if (e.ctrlKey || e.metaKey) {
            selectionActions.toggleRow(index);
        } else {
            selectionActions.selectRow(index);
        }
    }, [selectionActions]);

    // Get visible entries
    const visibleEntries = useMemo(() => {
        if (serverSide.value) {
            // Trigger fetch for visible range
            fetchEntries(scrollState.startIndex, scrollState.endIndex - scrollState.startIndex);
            return entries.value; // Return cached
        }
        return entries.value.slice(scrollState.startIndex, scrollState.endIndex);
    }, [entries.value, scrollState, serverSide.value]);

    // Extract categories for filter
    const categories = useMemo(() => 
        extractCategories(entries.value),
        [entries.value]
    );

    if (loading.value) {
        return <div className="log-table-loading">Loading...</div>;
    }

    return (
        <div className="log-table-container" data-testid="log-table-container">
            {selectionState.hasSelection && (
                <SelectionToolbar 
                    selectedCount={selectionState.selectionCount}
                    onClear={selectionActions.clearSelection}
                    selectedIndices={selectionActions.getSelectedIndices()}
                />
            )}
            
            <LogTableHeader 
                categories={categories}
                onSort={(column) => {/* ... */}}
            />
            
            <LogTableBody
                ref={containerRef}
                entries={visibleEntries}
                startIndex={scrollState.startIndex}
                scrollHeight={scrollState.scrollHeight}
                offsetY={scrollState.offsetY}
                rowHeight={ROW_HEIGHT}
                selectedRows={selectionState.selectedRows}
                onRowClick={handleRowClick}
                onScroll={scrollActions.onScroll}
            />
        </div>
    );
}

export default LogTable;
```

---

## Testing Strategy

### Unit Tests for Utils

```typescript
// frontend/src/components/log/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest';
import { filterEntries, extractCategories } from '../utils/filterEngine';
import type { LogEntry } from '../../../models/types';

describe('filterEngine', () => {
    const mockEntries: LogEntry[] = [
        { deviceId: 'D1', signalName: 'S1', timestamp: 1, value: true, signalType: 'boolean', category: 'System' },
        { deviceId: 'D2', signalName: 'S2', timestamp: 2, value: 42, signalType: 'integer', category: 'User' },
        { deviceId: 'D3', signalName: 'S3', timestamp: 3, value: 'test', signalType: 'string' },
    ];

    it('returns all entries when no filters active', () => {
        const result = filterEntries(mockEntries, {});
        expect(result).toHaveLength(3);
    });

    it('filters by category', () => {
        const result = filterEntries(mockEntries, {
            categories: new Set(['System'])
        });
        expect(result).toHaveLength(1);
        expect(result[0].deviceId).toBe('D1');
    });

    it('filters by search query (case insensitive)', () => {
        const result = filterEntries(mockEntries, {
            searchQuery: 'd2'
        });
        expect(result).toHaveLength(1);
        expect(result[0].deviceId).toBe('D2');
    });

    it('filters by regex', () => {
        const result = filterEntries(mockEntries, {
            searchQuery: '^D[12]$',
            useRegex: true
        });
        expect(result).toHaveLength(2);
    });

    it('extracts unique categories', () => {
        const categories = extractCategories(mockEntries);
        expect(categories).toContain('System');
        expect(categories).toContain('User');
        expect(categories).toContain('(Uncategorized)');
    });
});
```

### Component Tests

```typescript
// frontend/src/components/log/__tests__/LogTable.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { LogTable } from '../LogTable';
import { logStore } from '../../../stores/logStore';

describe('LogTable', () => {
    beforeEach(() => {
        // Reset store state
        vi.resetAllMocks();
    });

    it('renders virtual scroll container', () => {
        render(<LogTable />);
        expect(screen.getByTestId('log-table-container')).toBeInTheDocument();
    });

    it('shows loading state', () => {
        // Mock loading state
        vi.spyOn(logStore, 'isLoadingLog', 'get').mockReturnValue({ value: true } as any);
        
        render(<LogTable />);
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('handles row selection on click', () => {
        render(<LogTable />);
        const row = screen.getByTestId('log-row-0');
        
        fireEvent.click(row);
        
        expect(row).toHaveClass('selected');
    });

    it('shows selection toolbar when rows selected', () => {
        render(<LogTable />);
        const row = screen.getByTestId('log-row-0');
        
        fireEvent.click(row);
        
        expect(screen.getByText(/selected/i)).toBeInTheDocument();
    });
});
```

---

## Migration Checklist

### Day 1: Extract Hooks
- [ ] Create `useVirtualScroll.ts` with tests
- [ ] Create `useRowSelection.ts` with tests
- [ ] Create `useKeyboardNavigation.ts`
- [ ] Verify hooks work in isolation

### Day 2: Create Utils & Components
- [ ] Create `filterEngine.ts` with tests
- [ ] Create `LogTableRow.tsx`
- [ ] Create `CategoryFilterPopover.tsx` (extract from main)
- [ ] Create `LogTableHeader.tsx`
- [ ] Create `LogTableBody.tsx`

### Day 3: Refactor Main Component
- [ ] Create new `LogTable.tsx` using extracted pieces
- [ ] Remove old inline logic
- [ ] Wire up all components
- [ ] Run full test suite
- [ ] Verify no visual regressions

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| LogTable.tsx lines | 1,160 | ~120 |
| Component functions | 11 | 1 (container) |
| Longest function | 223 lines | <50 lines |
| Test coverage | ~10% | 75%+ |
| Re-render on scroll | Full component | Body only |
| Test files | 0 | 4+ |

---

## Performance Considerations

1. **Memoization**: Use `memo()` for row components
2. **Signal optimization**: Use computed signals for derived state
3. **Lazy loading**: Load visible rows only
4. **Debounced scroll**: Avoid excessive re-renders
5. **Worker threads**: Consider Web Workers for heavy filtering

---

## Commands

```bash
# Run component tests
cd frontend && npm run test -- src/components/log

# Watch mode for TDD
npm run test:watch -- src/components/log

# Coverage report
npm run test:coverage -- src/components/log

# Type check
npm run typecheck

# Build verification
npm run build
```
