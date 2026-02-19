import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useRowSelection } from '../useRowSelection';

describe('useRowSelection', () => {
  describe('initial state', () => {
    it('should start with empty selection', () => {
      const { result } = renderHook(() => useRowSelection());

      expect(result.current.state.selectedRows.size).toBe(0);
      expect(result.current.state.hasSelection).toBe(false);
      expect(result.current.state.selectionCount).toBe(0);
      expect(result.current.state.lastClickedRow).toBeNull();
    });
  });

  describe('toggleRow', () => {
    it('should add row when toggling unselected row', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(5);
      });

      expect(result.current.state.selectedRows.has(5)).toBe(true);
      expect(result.current.state.hasSelection).toBe(true);
      expect(result.current.state.selectionCount).toBe(1);
    });

    it('should remove row when toggling selected row', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(5);
        result.current.actions.toggleRow(5);
      });

      expect(result.current.state.selectedRows.has(5)).toBe(false);
      expect(result.current.state.hasSelection).toBe(false);
    });

    it('should update lastClickedRow', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(5);
      });

      expect(result.current.state.lastClickedRow).toBe(5);
    });
  });

  describe('selectRow', () => {
    it('should select single row', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRow(3);
      });

      expect(result.current.state.selectedRows.has(3)).toBe(true);
      expect(result.current.state.selectionCount).toBe(1);
    });

    it('should replace previous selection', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(1);
        result.current.actions.toggleRow(2);
        result.current.actions.selectRow(3);
      });

      expect(result.current.state.selectedRows.has(1)).toBe(false);
      expect(result.current.state.selectedRows.has(2)).toBe(false);
      expect(result.current.state.selectedRows.has(3)).toBe(true);
      expect(result.current.state.selectionCount).toBe(1);
    });
  });

  describe('selectRange', () => {
    it('should select range from last clicked', () => {
      const { result } = renderHook(() => useRowSelection());

      // Set anchor point
      act(() => {
        result.current.actions.selectRow(2);
      });
      
      // Range select to 5
      act(() => {
        result.current.actions.selectRange(5);
      });

      expect(result.current.state.selectedRows.has(2)).toBe(true);
      expect(result.current.state.selectedRows.has(3)).toBe(true);
      expect(result.current.state.selectedRows.has(4)).toBe(true);
      expect(result.current.state.selectedRows.has(5)).toBe(true);
      expect(result.current.state.selectionCount).toBe(4);
    });

    it('should work backwards', () => {
      const { result } = renderHook(() => useRowSelection());

      // Set anchor point
      act(() => {
        result.current.actions.selectRow(5);
      });
      
      // Range select backwards to 2
      act(() => {
        result.current.actions.selectRange(2);
      });

      expect(result.current.state.selectedRows.has(2)).toBe(true);
      expect(result.current.state.selectedRows.has(3)).toBe(true);
      expect(result.current.state.selectedRows.has(4)).toBe(true);
      expect(result.current.state.selectedRows.has(5)).toBe(true);
    });

    it('should fallback to selectRow if no last clicked', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRange(5);
      });

      expect(result.current.state.selectedRows.has(5)).toBe(true);
      expect(result.current.state.selectionCount).toBe(1);
    });

    it('should add range to current selection', () => {
      const { result } = renderHook(() => useRowSelection());

      // Use toggleRow to add row 10 to selection (doesn't clear)
      act(() => {
        result.current.actions.toggleRow(10);
      });
      
      // Use toggleRow for row 2 as well to preserve selection
      act(() => {
        result.current.actions.toggleRow(2);
      });
      
      // Range select from 2 to 5 (adds 2,3,4,5)
      act(() => {
        result.current.actions.selectRange(5);
      });

      // Row 10 should still be selected (from toggle)
      // Rows 2,3,4,5 should be selected (from range)
      expect(result.current.state.selectedRows.has(10)).toBe(true);
      expect(result.current.state.selectedRows.has(2)).toBe(true);
      expect(result.current.state.selectedRows.has(3)).toBe(true);
      expect(result.current.state.selectedRows.has(4)).toBe(true);
      expect(result.current.state.selectedRows.has(5)).toBe(true);
    });
  });

  describe('selectAll', () => {
    it('should select all rows', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectAll(100);
      });

      expect(result.current.state.selectionCount).toBe(100);
      expect(result.current.state.selectedRows.has(0)).toBe(true);
      expect(result.current.state.selectedRows.has(99)).toBe(true);
    });

    it('should clear lastClickedRow', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRow(5);
        result.current.actions.selectAll(100);
      });

      expect(result.current.state.lastClickedRow).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(1);
        result.current.actions.toggleRow(2);
        result.current.actions.clearSelection();
      });

      expect(result.current.state.hasSelection).toBe(false);
      expect(result.current.state.selectionCount).toBe(0);
    });

    it('should clear lastClickedRow', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRow(5);
        result.current.actions.clearSelection();
      });

      expect(result.current.state.lastClickedRow).toBeNull();
    });
  });

  describe('isSelected', () => {
    it('should return true for selected row', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRow(5);
      });

      expect(result.current.actions.isSelected(5)).toBe(true);
    });

    it('should return false for unselected row', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.selectRow(5);
      });

      expect(result.current.actions.isSelected(3)).toBe(false);
    });
  });

  describe('handleRowClick', () => {
    it('should select on plain click', () => {
      const { result } = renderHook(() => useRowSelection());
      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as MouseEvent;

      act(() => {
        result.current.actions.handleRowClick(mockEvent, 5);
      });

      expect(result.current.state.selectedRows.has(5)).toBe(true);
      expect(result.current.state.selectionCount).toBe(1);
    });

    it('should toggle on ctrl+click', () => {
      const { result } = renderHook(() => useRowSelection());
      const mockEvent = { shiftKey: false, ctrlKey: true, metaKey: false } as MouseEvent;

      act(() => {
        result.current.actions.handleRowClick(mockEvent, 5);
        result.current.actions.handleRowClick(mockEvent, 5);
      });

      expect(result.current.state.hasSelection).toBe(false);
    });

    it('should toggle on meta+click (Mac)', () => {
      const { result } = renderHook(() => useRowSelection());
      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: true } as MouseEvent;

      act(() => {
        result.current.actions.handleRowClick(mockEvent, 5);
      });

      expect(result.current.state.selectedRows.has(5)).toBe(true);
    });

    it('should range select on shift+click', () => {
      const { result } = renderHook(() => useRowSelection());
      const plainEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as MouseEvent;
      const shiftEvent = { shiftKey: true, ctrlKey: false, metaKey: false } as MouseEvent;

      // First click to set anchor point
      act(() => {
        result.current.actions.handleRowClick(plainEvent, 2);
      });
      
      // Shift+click to select range
      act(() => {
        result.current.actions.handleRowClick(shiftEvent, 5);
      });

      // Should select rows 2, 3, 4, 5 (4 rows total)
      expect(result.current.state.selectionCount).toBe(4);
    });
  });

  describe('getSelectedData', () => {
    it('should return selected items in order', () => {
      const { result } = renderHook(() => useRowSelection());
      const data = ['a', 'b', 'c', 'd', 'e'];

      act(() => {
        result.current.actions.toggleRow(4);
        result.current.actions.toggleRow(0);
        result.current.actions.toggleRow(2);
      });

      const selected = result.current.actions.getSelectedData(data);

      expect(selected).toEqual(['a', 'c', 'e']);
    });

    it('should return empty array for no selection', () => {
      const { result } = renderHook(() => useRowSelection());
      const data = ['a', 'b', 'c'];

      const selected = result.current.actions.getSelectedData(data);

      expect(selected).toEqual([]);
    });
  });

  describe('selectedIndices', () => {
    it('should return sorted indices', () => {
      const { result } = renderHook(() => useRowSelection());

      act(() => {
        result.current.actions.toggleRow(10);
        result.current.actions.toggleRow(5);
        result.current.actions.toggleRow(1);
      });

      expect(result.current.state.selectedIndices).toEqual([1, 5, 10]);
    });
  });
});
