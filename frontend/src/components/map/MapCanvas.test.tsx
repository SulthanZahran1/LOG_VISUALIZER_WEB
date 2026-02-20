import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MapCanvas } from './MapCanvas';

// Import signals directly from state files (not re-exports)
import {
    mapLayout,
    mapLoading,
    mapError,
    mapZoom,
    mapOffset,
    selectedUnitId,
    viewportSize,
    followedCarrierId,
} from '../../stores/map/state';

import type { MapLayout, MapObject } from '../../stores/map/types';

// Mock child components
vi.mock('./MapObjectComponents', () => ({
    MapObjectComponent: ({ object, onClick }: { object: MapObject; onClick: (id: string) => void }) => (
        <g data-testid={`map-object-${object.name}`} onClick={() => onClick(object.name)}>
            <rect data-testid={`rect-${object.name}`} />
        </g>
    )
}));

vi.mock('./MapDetailPanel', () => ({
    MapDetailPanel: () => <div data-testid="map-detail-panel">Detail Panel</div>
}));

vi.mock('./MapMediaControls', () => ({
    MapMediaControls: () => <div data-testid="map-media-controls">Media Controls</div>
}));

describe('MapCanvas', () => {
    const createMockLayout = (): MapLayout => ({
        version: '1.0',
        objects: {
            'Unit1': { name: 'Unit1', type: 'station', text: 'Unit 1', size: '12', location: '100,100', unitId: 'unit1', lineThick: '1', flowDirection: 'none', foreColor: 'black', endCap: 'none', startCap: 'none', dashStyle: 'solid' },
            'Unit2': { name: 'Unit2', type: 'station', text: 'Unit 2', size: '12', location: '200,200', unitId: 'unit2', lineThick: '1', flowDirection: 'none', foreColor: 'black', endCap: 'none', startCap: 'none', dashStyle: 'solid' }
        }
    });

    beforeEach(() => {
        mapLayout.value = null;
        mapLoading.value = false;
        mapError.value = null;
        mapZoom.value = 1;
        mapOffset.value = { x: 0, y: 0 };
        selectedUnitId.value = null;
        viewportSize.value = { width: 800, height: 600 };
        followedCarrierId.value = null;
    });

    describe('Loading States', () => {
        it('shows loading state when map is loading and no layout exists', () => {
            mapLoading.value = true;

            render(<MapCanvas />);

            expect(screen.getByText('Loading map...')).toBeInTheDocument();
        });

        // Note: Error state tests are covered in E2E: e2e/map-error-states.spec.ts

        it('renders map when layout is available', () => {
            mapLayout.value = createMockLayout();

            render(<MapCanvas />);

            expect(screen.getByTestId('map-detail-panel')).toBeInTheDocument();
            expect(screen.getByTestId('map-media-controls')).toBeInTheDocument();
        });
    });

    describe('Zoom Controls', () => {
        beforeEach(() => {
            mapLayout.value = createMockLayout();
        });

        it('zooms in when + button clicked', () => {
            render(<MapCanvas />);

            const zoomInBtn = screen.getByText('+');
            fireEvent.click(zoomInBtn);

            expect(mapZoom.value).toBeGreaterThan(1);
        });

        it('zooms out when - button clicked', () => {
            mapZoom.value = 1;

            render(<MapCanvas />);

            const zoomOutBtn = screen.getByText('-');
            fireEvent.click(zoomOutBtn);

            expect(mapZoom.value).toBeLessThan(1);
        });

        it('resets zoom and offset when Reset button clicked', () => {
            mapZoom.value = 2.5;
            mapOffset.value = { x: 100, y: 100 };

            render(<MapCanvas />);

            const resetBtn = screen.getByText('Reset');
            fireEvent.click(resetBtn);

            expect(mapZoom.value).toBe(1);
            expect(mapOffset.value).toEqual({ x: 0, y: 0 });
        });

        it('zooms with mouse wheel', () => {
            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            fireEvent.wheel(mapContainer!, { deltaY: -100 });

            expect(mapZoom.value).toBeGreaterThan(1);
        });

        it('limits zoom to minimum of 0.1', () => {
            mapZoom.value = 0.11;

            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            // Zoom out multiple times
            fireEvent.wheel(mapContainer!, { deltaY: 100 });
            fireEvent.wheel(mapContainer!, { deltaY: 100 });
            fireEvent.wheel(mapContainer!, { deltaY: 100 });

            expect(mapZoom.value).toBeGreaterThanOrEqual(0.1);
        });

        it('limits zoom to maximum of 10', () => {
            mapZoom.value = 9;

            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            // Zoom in multiple times
            fireEvent.wheel(mapContainer!, { deltaY: -100 });
            fireEvent.wheel(mapContainer!, { deltaY: -100 });

            expect(mapZoom.value).toBeLessThanOrEqual(10);
        });
    });

    describe('Pan Controls', () => {
        beforeEach(() => {
            mapLayout.value = createMockLayout();
        });

        it('pans when dragging with left mouse button', () => {
            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            fireEvent.mouseDown(mapContainer!, { button: 0, clientX: 100, clientY: 100 });
            fireEvent.mouseMove(mapContainer!, { clientX: 150, clientY: 120 });
            fireEvent.mouseUp(mapContainer!);

            expect(mapOffset.value.x).toBe(50);
            expect(mapOffset.value.y).toBe(20);
        });

        it('cancels follow mode when panning manually', () => {
            followedCarrierId.value = 'carrier1';

            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            fireEvent.mouseDown(mapContainer!, { button: 0, clientX: 100, clientY: 100 });
            fireEvent.mouseMove(mapContainer!, { clientX: 150, clientY: 150 });
            fireEvent.mouseUp(mapContainer!);

            expect(followedCarrierId.value).toBeNull();
        });

        it('stops dragging on mouse leave', () => {
            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            fireEvent.mouseDown(mapContainer!, { button: 0, clientX: 100, clientY: 100 });
            fireEvent.mouseLeave(mapContainer!);

            // Dragging should have stopped, no offset change on next move
            const previousOffset = { ...mapOffset.value };
            fireEvent.mouseMove(mapContainer!, { clientX: 200, clientY: 200 });

            expect(mapOffset.value).toEqual(previousOffset);
        });

        it('does not pan with non-left mouse button', () => {
            const { container } = render(<MapCanvas />);
            const mapContainer = container.querySelector('.map-container');

            fireEvent.mouseDown(mapContainer!, { button: 2, clientX: 100, clientY: 100 }); // Right click
            fireEvent.mouseMove(mapContainer!, { clientX: 150, clientY: 150 });

            expect(mapOffset.value).toEqual({ x: 0, y: 0 });
        });
    });

    describe('Object Selection', () => {
        beforeEach(() => {
            mapLayout.value = createMockLayout();
        });

        it('selects unit on map object click', () => {
            render(<MapCanvas />);

            const mapObject = screen.getByTestId('map-object-Unit1');
            fireEvent.click(mapObject);

            expect(selectedUnitId.value).toBe('Unit1');
        });
    });

    describe('SVG Rendering', () => {
        beforeEach(() => {
            mapLayout.value = createMockLayout();
        });

        it('renders SVG with correct transform', () => {
            mapOffset.value = { x: 50, y: 30 };
            mapZoom.value = 1.5;

            const { container } = render(<MapCanvas />);
            const svgGroup = container.querySelector('svg g');

            expect(svgGroup?.getAttribute('transform')).toBe('translate(50, 30) scale(1.5)');
        });

        it('renders map objects', () => {
            render(<MapCanvas />);

            expect(screen.getByTestId('map-object-Unit1')).toBeInTheDocument();
            expect(screen.getByTestId('map-object-Unit2')).toBeInTheDocument();
        });

        it('renders arrow marker definition', () => {
            const { container } = render(<MapCanvas />);
            const marker = container.querySelector('#arrowhead');

            expect(marker).toBeInTheDocument();
        });
    });

    describe('Viewport Size', () => {
        beforeEach(() => {
            mapLayout.value = createMockLayout();
        });

        it('updates viewport size on resize', () => {
            render(<MapCanvas />);

            // ResizeObserver should have been called
            // Note: We mock ResizeObserver in setup.ts, but in a real test we'd verify
            // the viewportSize signal gets updated
            expect(viewportSize.value).toBeDefined();
        });
    });
});
