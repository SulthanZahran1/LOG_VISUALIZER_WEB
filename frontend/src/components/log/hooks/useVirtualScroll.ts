/**
 * useVirtualScroll Hook
 * 
 * Provides virtualization for large lists by calculating visible range
 * based on scroll position with buffer support for smooth scrolling.
 * 
 * @example
 * const { state, actions, containerRef } = useVirtualScroll({
 *   rowHeight: 28,
 *   buffer: 5,
 *   totalItems: 100000,
 *   containerHeight: 600,
 *   serverSide: true
 * });
 */
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
  /** Enable server-side mode with scroll scaling */
  serverSide?: boolean;
  /** Page size for server-side fetching */
  pageSize?: number;
  /** Maximum scroll height (browser limit) */
  maxScrollHeight?: number;
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
  /** Scale factor for server-side mode */
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
  /** Get container style */
  getContainerStyle: () => React.CSSProperties;
}

const DEFAULT_MAX_SCROLL_HEIGHT = 15_000_000; // Browser safe limit

/**
 * Hook for virtualized scrolling with buffer support
 * 
 * Features:
 * - Virtual viewport calculation
 * - Buffer rows for smooth scrolling
 * - Server-side mode with scroll scaling for large datasets
 * - Memoized calculations for performance
 */
export function useVirtualScroll(config: VirtualScrollConfig): {
  state: VirtualScrollState;
  actions: VirtualScrollActions;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const maxScrollHeight = config.maxScrollHeight ?? DEFAULT_MAX_SCROLL_HEIGHT;

  // Calculate scale factor for server-side mode
  const scaleFactor = useMemo(() => {
    if (!config.serverSide) return 1;
    const realHeight = config.totalItems * config.rowHeight;
    if (realHeight <= maxScrollHeight) return 1;
    return realHeight / maxScrollHeight;
  }, [config.serverSide, config.totalItems, config.rowHeight, maxScrollHeight]);

  // Calculate visible range
  const { startIndex, endIndex, offsetY, scrollHeight } = useMemo(() => {
    const realScrollTop = scrollTop * scaleFactor;
    const visibleCount = Math.ceil(config.containerHeight / config.rowHeight);
    
    // Calculate start index with buffer
    const rawStartIndex = Math.floor(realScrollTop / config.rowHeight);
    const start = Math.max(0, rawStartIndex - config.buffer);
    
    // Calculate end index with buffer
    const end = Math.min(
      config.totalItems,
      rawStartIndex + visibleCount + config.buffer
    );

    // Calculate scroll height
    const realHeight = config.totalItems * config.rowHeight;
    const height = config.serverSide
      ? Math.min(realHeight / scaleFactor, maxScrollHeight)
      : realHeight;

    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * config.rowHeight,
      scrollHeight: height
    };
  }, [
    scrollTop,
    config.totalItems,
    config.rowHeight,
    config.buffer,
    config.containerHeight,
    config.serverSide,
    scaleFactor,
    maxScrollHeight
  ]);

  const onScroll = useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const offset = (index * config.rowHeight) / scaleFactor;
    containerRef.current?.scrollTo({ top: offset, behavior: 'smooth' });
  }, [config.rowHeight, scaleFactor]);

  const scrollToOffset = useCallback((offset: number) => {
    containerRef.current?.scrollTo({ 
      top: offset / scaleFactor, 
      behavior: 'smooth' 
    });
  }, [scaleFactor]);

  const getItemStyle = useCallback((index: number): React.CSSProperties => ({
    position: 'absolute',
    top: index * config.rowHeight,
    height: config.rowHeight,
    left: 0,
    right: 0,
  }), [config.rowHeight]);

  const getContainerStyle = useCallback((): React.CSSProperties => ({
    height: scrollHeight,
    position: 'relative',
  }), [scrollHeight]);

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
      getItemStyle,
      getContainerStyle
    },
    containerRef
  };
}

export default useVirtualScroll;
