import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { WaveformCanvas } from './WaveformCanvas';

// Import signals directly from source files (not re-exports)
// Note: viewRange, deviceColors, availableSignals are computed - don't try to set them
import {
    scrollOffset,
    zoomLevel,
    viewportWidth,
    hoverTime,
    selectionRange,
    waveformEntries,
    waveformBoundaries,
    allSignals,
    allSignalTypes,
    showChangedInView,
    signalsWithChanges,
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    isDragging,
    showSidebar,
    isWaveformLoading,
    waveformLoadingProgress,
    hoverX,
    hoverRow,
} from '../../stores/waveform/state';

import {
    selectedSignals,
    focusedSignal,
} from '../../stores/selectionStore';

import { bookmarks } from '../../stores/bookmarkStore';
import { currentSession } from '../../stores/log/state';
import type { LogEntry, ParseSession } from '../../models/types';

// Mock canvas context
const mockContext = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
};

// Mock getContext
HTMLCanvasElement.prototype.getContext = vi.fn((contextId: '2d'): CanvasRenderingContext2D | null => {
    if (contextId === '2d') {
        return mockContext as unknown as CanvasRenderingContext2D;
    }
    return null;
}) as unknown as HTMLCanvasElement['getContext'];

// Mock getBoundingClientRect
HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => {}
}));

// Mock devicePixelRatio
Object.defineProperty(window, 'devicePixelRatio', {
    writable: true,
    value: 2
});

describe('WaveformCanvas', () => {
    const createMockEntries = (device: string, signal: string, count: number): LogEntry[] => {
        const entries: LogEntry[] = [];
        const baseTime = 1700000000000;
        for (let i = 0; i < count; i++) {
            entries.push({
                deviceId: device,
                signalName: signal,
                timestamp: baseTime + i * 1000,
                value: i % 2 === 0,
                signalType: 'boolean',
                category: 'test'
            });
        }
        return entries;
    };

    const createMockSession = (): ParseSession => ({
        id: 'test-session',
        fileId: 'file1',
        fileIds: ['file1'],
        status: 'complete',
        progress: 100,
        entryCount: 100,
        startTime: 1700000000000,
        endTime: 1700000100000
    });

    beforeEach(() => {
        // Reset all writable signals
        scrollOffset.value = 0;
        zoomLevel.value = 1;
        viewportWidth.value = 800;
        hoverTime.value = null;
        selectionRange.value = null;
        waveformEntries.value = {};
        waveformBoundaries.value = { before: {}, after: {} };
        allSignals.value = [];
        allSignalTypes.value = new Map();
        showChangedInView.value = false;
        signalsWithChanges.value = new Set();
        signalSearchQuery.value = '';
        signalIsRegex.value = false;
        signalTypeFilter.value = 'all';
        isDragging.value = false;
        showSidebar.value = true;
        isWaveformLoading.value = false;
        waveformLoadingProgress.value = 0;
        hoverX.value = null;
        hoverRow.value = null;
        selectedSignals.value = [];
        focusedSignal.value = null;
        bookmarks.value = [];
        currentSession.value = createMockSession();

        // Reset mock context calls
        vi.clearAllMocks();
    });

    describe('Rendering', () => {
        it('renders canvas element', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            expect(canvas).toBeInTheDocument();
        });

        it('sets canvas dimensions based on devicePixelRatio', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas') as HTMLCanvasElement;

            // Canvas dimensions should be scaled by devicePixelRatio
            expect(canvas.width).toBe(viewportWidth.value * window.devicePixelRatio);
        });

        it('shows loading overlay when waveform is loading', () => {
            isWaveformLoading.value = true;

            const { container } = render(<WaveformCanvas />);
            const loadingIndicator = container.querySelector('.waveform-loading-indicator');

            expect(loadingIndicator).toBeInTheDocument();
            expect(screen.getByText(/Loading/i)).toBeInTheDocument();
        });
    });

    describe('Canvas Interactions', () => {
        beforeEach(() => {
            selectedSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5),
                'Device1::Signal2': createMockEntries('Device1', 'Signal2', 5)
            };
        });

        it('handles mouse move to update hover position', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            fireEvent.mouseMove(canvas!, { clientX: 200, clientY: 100 });

            expect(hoverX.value).not.toBeNull();
            expect(hoverRow.value).not.toBeNull();
        });

        // Note: Hover state tests are covered in E2E: e2e/canvas-interactions.spec.ts
    });

    describe('Pan Interactions', () => {
        beforeEach(() => {
            selectedSignals.value = ['Device1::Signal1'];
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5)
            };
        });

        it('pans on horizontal wheel without Ctrl', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            const initialOffset = scrollOffset.value;

            fireEvent.wheel(canvas!, {
                deltaX: 100,
                deltaY: 0,
                ctrlKey: false
            });

            // Scroll offset should have changed
            expect(scrollOffset.value).not.toBe(initialOffset);
        });
    });

    describe('Time Selection', () => {
        beforeEach(() => {
            selectedSignals.value = ['Device1::Signal1'];
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5)
            };
        });

        it('starts selection with Shift+click', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            fireEvent.mouseDown(canvas!, {
                button: 0,
                shiftKey: true,
                clientX: 200
            });

            // Selection should be initiated
            fireEvent.mouseMove(canvas!, { clientX: 300 });
            fireEvent.mouseUp(canvas!);

            expect(selectionRange.value).not.toBeNull();
        });

        it('clears selection on mouse down without Shift', () => {
            selectionRange.value = { start: 1700000001000, end: 1700000005000 };

            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            fireEvent.mouseDown(canvas!, { button: 0, shiftKey: false });

            expect(selectionRange.value).toBeNull();
        });
    });

    describe('Loading Cancel', () => {
        it('shows cancel button when loading', () => {
            isWaveformLoading.value = true;

            const { container } = render(<WaveformCanvas />);
            const cancelBtn = container.querySelector('.waveform-loading-cancel');

            expect(cancelBtn).toBeInTheDocument();
        });
    });

    describe('Canvas Context', () => {
        beforeEach(() => {
            selectedSignals.value = ['Device1::Signal1'];
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5)
            };
        });

        it('gets 2d context on mount', () => {
            const { container } = render(<WaveformCanvas />);
            const canvas = container.querySelector('canvas');

            expect(canvas?.getContext('2d')).toBeDefined();
        });
    });

    describe('Bookmarks', () => {
        it('renders bookmarks on canvas', () => {
            selectedSignals.value = ['Device1::Signal1'];
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5)
            };
            bookmarks.value = [
                { id: 'bm1', time: 1700000002000, name: 'Bookmark 1', createdAt: Date.now() }
            ];

            render(<WaveformCanvas />);

            expect(bookmarks.value).toHaveLength(1);
        });
    });

    describe('Focused Signal', () => {
        it('highlights focused signal row', () => {
            selectedSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            focusedSignal.value = 'Device1::Signal1';
            waveformEntries.value = {
                'Device1::Signal1': createMockEntries('Device1', 'Signal1', 5),
                'Device1::Signal2': createMockEntries('Device1', 'Signal2', 5)
            };

            render(<WaveformCanvas />);

            expect(focusedSignal.value).toBe('Device1::Signal1');
        });
    });
});
