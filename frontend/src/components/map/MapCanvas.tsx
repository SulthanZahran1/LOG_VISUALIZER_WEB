import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import {
    mapLayout, mapLoading, mapError, mapZoom, mapOffset, selectedUnitId, fetchMapLayout, mapObjectsArray,
    unitCarrierCounts, getCarrierCountColor, getCarrierDisplayText,
    type MapObject
} from '../../stores/mapStore';
import { MapObjectComponent } from './MapObjectComponents';

export function MapCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useSignal(false);
    const lastMousePos = useSignal({ x: 0, y: 0 });

    useEffect(() => {
        fetchMapLayout();
    }, []);

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(mapZoom.value * delta, 0.1), 10);
        mapZoom.value = newZoom;
    };

    const handleMouseDown = (e: MouseEvent) => {
        if (e.button === 0) { // Left click for pan
            isDragging.value = true;
            lastMousePos.value = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.value) {
            const dx = e.clientX - lastMousePos.value.x;
            const dy = e.clientY - lastMousePos.value.y;
            mapOffset.value = {
                x: mapOffset.value.x + dx,
                y: mapOffset.value.y + dy
            };
            lastMousePos.value = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isDragging.value = false;
    };

    if (mapError.value) {
        return (
            <div class="map-error">
                <p>{mapError.value}</p>
                <button onClick={fetchMapLayout}>Retry</button>
            </div>
        );
    }

    if (mapLoading.value && !mapLayout.value) {
        return <div class="map-loading">Loading map...</div>;
    }

    // Get carrier counts for coloring
    const carrierCounts = unitCarrierCounts.value;

    return (
        <div
            ref={containerRef}
            class="map-container"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <svg class="map-svg" width="100%" height="100%">
                <defs>
                    <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="10"
                        refY="3.5"
                        orient="auto"
                    >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
                    </marker>
                </defs>
                <g transform={`translate(${mapOffset.value.x}, ${mapOffset.value.y}) scale(${mapZoom.value})`}>
                    {mapObjectsArray.value.map((obj: MapObject) => {
                        const count = obj.unitId ? (carrierCounts.get(obj.unitId) || 0) : 0;
                        const carrierColor = count > 0 ? getCarrierCountColor(count) : undefined;
                        const carrierText = obj.unitId ? getCarrierDisplayText(obj.unitId) : null;

                        return (
                            <MapObjectComponent
                                key={obj.name}
                                object={obj}
                                selected={selectedUnitId.value === obj.unitId}
                                onClick={(id) => selectedUnitId.value = id}
                                carrierColor={carrierColor}
                                carrierText={carrierText}
                            />
                        );
                    })}
                </g>
            </svg>

            {/* Controls */}
            <div class="map-controls">
                <button onClick={() => mapZoom.value *= 1.2}>+</button>
                <button onClick={() => mapZoom.value /= 1.2}>-</button>
                <button onClick={() => { mapZoom.value = 1; mapOffset.value = { x: 0, y: 0 }; }}>Reset</button>
            </div>

            <style>{`
                .map-container {
                    flex: 1;
                    height: 100%;
                    background: var(--bg-primary);
                    position: relative;
                    overflow: hidden;
                    cursor: grab;
                }
                .map-container:active {
                    cursor: grabbing;
                }
                .map-svg {
                    display: block;
                }
                .map-controls {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .map-controls button {
                    width: 36px;
                    height: 36px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--text-primary);
                    font-size: 18px;
                    cursor: pointer;
                }
                .map-loading, .map-error {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-secondary);
                }
            `}</style>
        </div>
    );
}
