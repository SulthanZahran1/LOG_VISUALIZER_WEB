import type { MapObject } from '../../stores/mapStore';

interface ObjectProps {
    object: MapObject;
    selected?: boolean;
    onClick?: (unitId: string) => void;
}

export function MapObjectComponent({ object, selected, onClick }: ObjectProps) {
    const loc = parseLocation(object.location);
    const size = parseSize(object.size);

    if (!loc || !size) return null;

    const { x, y } = loc;
    const { width, height } = size;

    // Determine render type
    if (object.type.includes('WidgetArrow')) {
        return <Arrow object={object} x={x} y={y} width={width} height={height} selected={selected} />;
    }
    if (object.type.includes('Label')) {
        return <Label object={object} x={x} y={y} height={height} selected={selected} />;
    }

    // Default to rectangle (Belt, Diverter, Port)
    return (
        <g onClick={() => object.unitId && onClick?.(object.unitId)} style={{ cursor: object.unitId ? 'pointer' : 'default' }}>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={selected ? 'rgba(255, 0, 0, 0.2)' : 'var(--bg-tertiary)'}
                stroke={selected ? '#ff0000' : '#444'}
                strokeWidth={selected ? 2 : 1}
            />
            {object.text && (
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text-secondary)"
                    fontSize="10"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                    {object.text}
                </text>
            )}
        </g>
    );
}

function Arrow({ object, x, y, width, height, selected }: { object: MapObject, x: number, y: number, width: number, height: number, selected?: boolean }) {
    const flow = object.flowDirection || 'Angle_90';
    const angle = parseAngle(flow);
    const cx = x + width / 2;
    const cy = y + height / 2;

    const lineThick = parseInt(object.lineThick) || 2;
    const color = object.foreColor === 'HotTrack' ? 'var(--primary-accent)' : '#888';

    // Simplified arrow: just a line with a marker
    return (
        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
            <line
                x1={x}
                y1={cy}
                x2={x + width}
                y2={cy}
                stroke={selected ? '#ff0000' : color}
                strokeWidth={lineThick}
                markerEnd="url(#arrowhead)"
            />
        </g>
    );
}

function Label({ object, x, y, height, selected }: { object: MapObject, x: number, y: number, height: number, selected?: boolean }) {
    return (
        <text
            x={x}
            y={y + height}
            fill={selected ? '#ff0000' : 'var(--text-muted)'}
            fontSize="11"
            fontWeight="600"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
            {object.text}
        </text>
    );
}

// Helpers
function parseLocation(loc: string) {
    const parts = loc.split(',').map(p => parseInt(p.trim()));
    if (parts.length !== 2) return null;
    return { x: parts[0], y: parts[1] };
}

function parseSize(size: string) {
    const parts = size.split(',').map(p => parseInt(p.trim()));
    if (parts.length !== 2) return null;
    return { width: parts[0], height: parts[1] };
}

function parseAngle(flow: string) {
    if (!flow.startsWith('Angle_')) return 0;
    const val = parseInt(flow.split('_')[1]);
    return val - 90; // Align with SVG coordinate system
}
