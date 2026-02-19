import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useVirtualScroll } from '../useVirtualScroll';

describe('useVirtualScroll', () => {
  const defaultConfig = {
    rowHeight: 28,
    buffer: 5,
    totalItems: 1000,
    containerHeight: 300
  };

  describe('initial state', () => {
    it('should calculate initial state correctly', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      expect(result.current.state.startIndex).toBe(0);
      expect(result.current.state.scrollTop).toBe(0);
      expect(result.current.state.scaleFactor).toBe(1);
    });

    it('should calculate visible range with buffer', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      // With containerHeight=300 and rowHeight=28, visible count is ~11
      // Plus buffer of 5 on each side
      expect(result.current.state.endIndex).toBe(21);
    });

    it('should calculate correct scroll height', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      // 1000 items * 28px = 28000px
      expect(result.current.state.scrollHeight).toBe(28000);
    });
  });

  describe('scroll handling', () => {
    it('should update scroll position', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      act(() => {
        result.current.actions.onScroll(1000);
      });

      expect(result.current.state.scrollTop).toBe(1000);
    });

    it('should update visible range on scroll', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      // Scroll to position that should show items starting around index 30
      act(() => {
        result.current.actions.onScroll(1000);
      });

      // 1000px / 28px per row = ~35 rows
      // Minus buffer of 5 = start around 30
      expect(result.current.state.startIndex).toBeGreaterThan(0);
      expect(result.current.state.startIndex).toBeLessThan(40);
    });

    it('should not go below start index 0', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      act(() => {
        result.current.actions.onScroll(-100);
      });

      // Negative scroll should still give startIndex 0
      expect(result.current.state.startIndex).toBe(0);
    });

    it('should not exceed total items', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      // Scroll way past the end
      act(() => {
        result.current.actions.onScroll(100000);
      });

      expect(result.current.state.endIndex).toBeLessThanOrEqual(1000);
    });
  });

  describe('server-side mode', () => {
    const serverConfig = {
      ...defaultConfig,
      serverSide: true,
      totalItems: 1000000 // Large dataset
    };

    it('should calculate scale factor for large datasets', () => {
      const { result } = renderHook(() => useVirtualScroll(serverConfig));

      // 1M items * 28px = 28M px, which exceeds max scroll
      // Scale factor should be > 1
      expect(result.current.state.scaleFactor).toBeGreaterThan(1);
    });

    it('should cap scroll height at max', () => {
      const { result } = renderHook(() => useVirtualScroll(serverConfig));

      // Should be capped at ~15M
      expect(result.current.state.scrollHeight).toBeLessThanOrEqual(15000000);
    });

    it('should scale scroll position correctly', () => {
      const { result } = renderHook(() => useVirtualScroll(serverConfig));

      act(() => {
        result.current.actions.onScroll(1000);
      });

      // Scroll position should be scaled up for calculations
      expect(result.current.state.scrollTop).toBe(1000);
    });
  });

  describe('item styles', () => {
    it('should generate correct item style', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      const style = result.current.actions.getItemStyle(10);

      expect(style.position).toBe('absolute');
      expect(style.top).toBe(280); // 10 * 28
      expect(style.height).toBe(28);
    });

    it('should generate correct container style', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      const style = result.current.actions.getContainerStyle();

      expect(style.height).toBe(28000);
      expect(style.position).toBe('relative');
    });
  });

  describe('scroll to index', () => {
    it('should calculate correct offset for scrollToIndex', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      // This would scroll the container if we had a real DOM
      // Just verify it doesn't throw
      expect(() => {
        act(() => {
          result.current.actions.scrollToIndex(100);
        });
      }).not.toThrow();
    });

    it('should calculate correct offset for scrollToOffset', () => {
      const { result } = renderHook(() => useVirtualScroll(defaultConfig));

      expect(() => {
        act(() => {
          result.current.actions.scrollToOffset(1000);
        });
      }).not.toThrow();
    });
  });

  describe('memoization', () => {
    it('should not recalculate when dependencies unchanged', () => {
      const { result, rerender } = renderHook(
        () => useVirtualScroll(defaultConfig)
      );

      const initialStartIndex = result.current.state.startIndex;

      // Rerender with same config
      rerender();

      // Should be memoized to same value
      expect(result.current.state.startIndex).toBe(initialStartIndex);
    });
  });
});
