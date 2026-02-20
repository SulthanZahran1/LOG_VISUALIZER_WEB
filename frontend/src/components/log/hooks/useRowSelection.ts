/**
 * useRowSelection Hook
 * 
 * Provides multi-row selection functionality with keyboard modifier support.
 * Supports click, ctrl+click (toggle), and shift+click (range select).
 * 
 * @example
 * const { state, actions } = useRowSelection();
 * 
 * // In click handler:
 * actions.handleRowClick(event, rowIndex);
 */
import { useState, useCallback, useMemo } from 'preact/hooks';

export interface RowSelectionState {
  /** Set of selected row indices */
  selectedRows: Set<number>;
  /** Last clicked row for shift-select */
  lastClickedRow: number | null;
  /** Whether any rows are selected */
  hasSelection: boolean;
  /** Count of selected rows */
  selectionCount: number;
  /** Selected indices as sorted array */
  selectedIndices: number[];
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
  /** Handle row click with modifier keys */
  handleRowClick: (event: MouseEvent, index: number) => void;
  /** Get data for clipboard copy */
  getSelectedData: <T>(data: T[]) => T[];
}

/**
 * Hook for multi-row selection with keyboard modifier support
 * 
 * Features:
 * - Click: Select single row
 * - Ctrl/Cmd+Click: Toggle row selection
 * - Shift+Click: Range select from last clicked
 * - Select all / Clear selection
 * - Clipboard-friendly selected data
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

  const isSelected = useCallback((index: number): boolean => {
    return selectedRows.has(index);
  }, [selectedRows]);

  const handleRowClick = useCallback((event: MouseEvent, index: number) => {
    if (event.shiftKey) {
      selectRange(index);
    } else if (event.ctrlKey || event.metaKey) {
      toggleRow(index);
    } else {
      selectRow(index);
    }
  }, [selectRange, toggleRow, selectRow]);

  const getSelectedData = useCallback(<T,>(data: T[]): T[] => {
    const indices = Array.from(selectedRows).sort((a, b) => a - b);
    return indices.map(i => data[i]).filter((item): item is T => item !== undefined);
  }, [selectedRows]);

  const selectedIndices = useMemo(() => {
    return Array.from(selectedRows).sort((a, b) => a - b);
  }, [selectedRows]);

  const state: RowSelectionState = useMemo(() => ({
    selectedRows,
    lastClickedRow,
    hasSelection: selectedRows.size > 0,
    selectionCount: selectedRows.size,
    selectedIndices
  }), [selectedRows, lastClickedRow, selectedIndices]);

  const actions: RowSelectionActions = {
    toggleRow,
    selectRow,
    selectRange,
    selectAll,
    clearSelection,
    isSelected,
    handleRowClick,
    getSelectedData
  };

  return { state, actions };
}

export default useRowSelection;
