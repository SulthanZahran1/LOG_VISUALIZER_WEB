import { Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getParseEntries } from '../../api/client';
import type { LogEntry } from '../../models/types';
import { currentSession, logEntries, useServerSide } from '../../stores/logStore';
import { parseTRSValue } from '../../utils/trsLog';
import './TransferHeatmap.css';

interface TransferHeatmapProps {
    onCellClick?: (rackId: string) => void;
    showControls?: boolean;
}

type IntensityMode = 'global' | 'row' | 'column' | 'log';
type LabelMode = 'count' | 'percent' | 'both';
type PaletteKey = 'red' | 'amber' | 'blue';

interface RackCoordinate {
    rackId: string;
    z: number;
    x: number;
    y: number;
    yKey: string;
}

interface YAxisValue {
    key: string;
    label: string;
    z: number;
    y: number;
}

interface HeatmapData {
    matrix: Record<string, Record<number, number>>;
    cellRackIds: Record<string, Record<number, string>>;
    xValues: number[];
    yValues: YAxisValue[];
    rowTotals: Record<string, number>;
    colTotals: Record<number, number>;
    rowMax: Record<string, number>;
    colMax: Record<number, number>;
    rackCount: number;
    transferRows: number;
    totalRackHits: number;
    maxCount: number;
}

const palettes: Record<PaletteKey, { label: string; rgb: [number, number, number] }> = {
    red: { label: 'Red', rgb: [220, 38, 38] },
    amber: { label: 'Amber', rgb: [245, 158, 11] },
    blue: { label: 'Blue', rgb: [59, 130, 246] },
};

const RACK_ID_PATTERN = /(?:^|[^0-9])(\d)(\d{3})(\d{2})(?!\d)/;

function formatX(x: number): string {
    return `X${String(x).padStart(3, '0')}`;
}

function formatY(z: number, y: number): string {
    return `Z${z}-Y${String(y).padStart(2, '0')}`;
}

function extractRackCoordinate(value: unknown): RackCoordinate | null {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const match = text.match(RACK_ID_PATTERN);
    if (!match) return null;

    const z = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);

    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return null;

    const xPart = match[2];
    const yPart = match[3];

    return {
        rackId: `${z}${xPart}${yPart}`,
        z,
        x,
        y,
        yKey: `Z${z}-${yPart}`,
    };
}

export function TransferHeatmap({ onCellClick, showControls = true }: TransferHeatmapProps) {
    const [intensityMode, setIntensityMode] = useState<IntensityMode>('global');
    const [labelMode, setLabelMode] = useState<LabelMode>('count');
    const [palette, setPalette] = useState<PaletteKey>('red');
    const [minCount, setMinCount] = useState(1);
    const [locationFilter, setLocationFilter] = useState('');
    const [showZeros, setShowZeros] = useState(false);
    const [fullSessionEntries, setFullSessionEntries] = useState<LogEntry[] | null>(null);
    const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
    const [isLoadingAllEntries, setIsLoadingAllEntries] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const session = currentSession.value;
    const isServerSide = useServerSide.value;

    useEffect(() => {
        if (!session || session.parserName !== 'trs_log' || !isServerSide) {
            setFullSessionEntries(null);
            setLoadedSessionId(null);
            setIsLoadingAllEntries(false);
            setLoadError(null);
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        setFullSessionEntries(null);
        setLoadedSessionId(null);

        const loadAllEntries = async () => {
            setIsLoadingAllEntries(true);
            setLoadError(null);

            try {
                const pageSize = 1000;
                const allEntries: LogEntry[] = [];
                let page = 1;
                let total = 0;

                do {
                    const response = await getParseEntries(session.id, page, pageSize, undefined, controller.signal);
                    if (cancelled) {
                        return;
                    }

                    total = response.total;
                    allEntries.push(...response.entries);
                    page += 1;

                    if (response.entries.length === 0) {
                        break;
                    }
                } while (allEntries.length < total);

                if (!cancelled) {
                    setFullSessionEntries(allEntries);
                    setLoadedSessionId(session.id);
                }
            } catch (err) {
                if (cancelled || (err as { name?: string }).name === 'AbortError') {
                    return;
                }
                setLoadError((err as Error).message || 'Failed to load heatmap data');
            } finally {
                if (!cancelled) {
                    setIsLoadingAllEntries(false);
                }
            }
        };

        void loadAllEntries();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [isServerSide, session?.id, session?.parserName]);

    const entries = isServerSide
        ? (session?.id === loadedSessionId ? (fullSessionEntries ?? []) : [])
        : logEntries.value;

    const data: HeatmapData = useMemo(() => {
        const matrix: Record<string, Record<number, number>> = {};
        const cellRackIds: Record<string, Record<number, string>> = {};
        const xSet = new Set<number>();
        const yMap = new Map<string, YAxisValue>();
        const rackIds = new Set<string>();
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        const rowMax: Record<string, number> = {};
        const colMax: Record<number, number> = {};
        let transferRows = 0;
        let totalRackHits = 0;
        let maxCount = 0;

        // We only process entries where SignalName is "Transfer"
        // Value format: CommandID|Status|Source|Dest|CurrLoc|Result
        entries.forEach(entry => {
            if (entry.signalName !== 'Transfer') return;

            const trsFields = parseTRSValue(entry.value);
            const status = trsFields.status.trim().toUpperCase();
            if (status !== 'COMPLETED') return;

            const sourceRack = extractRackCoordinate(trsFields.source);
            const destRack = extractRackCoordinate(trsFields.dest);
            const racks: RackCoordinate[] = [sourceRack, destRack].filter((rack): rack is RackCoordinate => rack !== null);
            if (racks.length === 0) return;
            transferRows += 1;

            racks.forEach(rack => {
                rackIds.add(rack.rackId);
                xSet.add(rack.x);
                totalRackHits += 1;

                yMap.set(rack.yKey, {
                    key: rack.yKey,
                    label: formatY(rack.z, rack.y),
                    z: rack.z,
                    y: rack.y,
                });

                if (!matrix[rack.yKey]) matrix[rack.yKey] = {};
                if (!cellRackIds[rack.yKey]) cellRackIds[rack.yKey] = {};

                matrix[rack.yKey][rack.x] = (matrix[rack.yKey][rack.x] || 0) + 1;
                cellRackIds[rack.yKey][rack.x] = rack.rackId;
                if (matrix[rack.yKey][rack.x] > maxCount) maxCount = matrix[rack.yKey][rack.x];
            });
        });

        const xValues = Array.from(xSet).sort((a, b) => a - b);
        const yValues = Array.from(yMap.values()).sort((a, b) => {
            if (a.z !== b.z) return a.z - b.z;
            return a.y - b.y;
        });

        yValues.forEach(yAxis => {
            rowTotals[yAxis.key] = 0;
            rowMax[yAxis.key] = 0;
        });
        xValues.forEach(x => {
            colTotals[x] = 0;
            colMax[x] = 0;
        });

        yValues.forEach(yAxis => {
            xValues.forEach(x => {
                const count = matrix[yAxis.key]?.[x] || 0;
                if (count <= 0) return;

                rowTotals[yAxis.key] += count;
                colTotals[x] += count;
                rowMax[yAxis.key] = Math.max(rowMax[yAxis.key], count);
                colMax[x] = Math.max(colMax[x], count);
            });
        });

        return {
            matrix,
            cellRackIds,
            xValues,
            yValues,
            rowTotals,
            colTotals,
            rowMax,
            colMax,
            rackCount: rackIds.size,
            transferRows,
            totalRackHits,
            maxCount,
        };
    }, [entries]);

    if (data.xValues.length === 0 || data.yValues.length === 0) {
        return (
            <div className="transfer-heatmap-empty">
                {loadError
                    ? `Failed to load heatmap data: ${loadError}`
                    : `No rack ID data available for heatmap. ${(entries.length === 0 && isLoadingAllEntries) ? "(Loading full TRS dataset...)" : entries.length === 0 ? "(Loading...)" : ""}`}
            </div>
        );
    }

    const locationFilterText = locationFilter.trim().toLowerCase();

    const filteredXValues = data.xValues.filter(x => {
        if (!locationFilterText) return true;
        const xLabel = formatX(x).toLowerCase();
        return xLabel.includes(locationFilterText) || String(x).padStart(3, '0').includes(locationFilterText);
    });

    const filteredYValues = data.yValues.filter(yAxis => {
        if (!locationFilterText) return true;
        return yAxis.label.toLowerCase().includes(locationFilterText);
    });

    let visibleRackCells = 0;
    filteredYValues.forEach(yAxis => {
        filteredXValues.forEach(x => {
            const cellCount = data.matrix[yAxis.key]?.[x] || 0;
            if (cellCount >= minCount) visibleRackCells += 1;
        });
    });

    const intensityFor = (yKey: string, x: number, count: number): number => {
        if (count <= 0) return 0;
        if (intensityMode === 'row') {
            const rowMax = data.rowMax[yKey] || 0;
            return rowMax > 0 ? count / rowMax : 0;
        }
        if (intensityMode === 'column') {
            const colMax = data.colMax[x] || 0;
            return colMax > 0 ? count / colMax : 0;
        }
        if (intensityMode === 'log') {
            const maxValue = Math.log(data.maxCount + 1);
            return maxValue > 0 ? Math.log(count + 1) / maxValue : 0;
        }
        return data.maxCount > 0 ? count / data.maxCount : 0;
    };

    const formatLabel = (count: number, intensity: number): string => {
        if (labelMode === 'percent') return `${Math.round(intensity * 100)}%`;
        if (labelMode === 'both') return `${count} (${Math.round(intensity * 100)}%)`;
        return String(count);
    };

    const resetOptions = () => {
        setIntensityMode('global');
        setLabelMode('count');
        setPalette('red');
        setMinCount(1);
        setLocationFilter('');
        setShowZeros(false);
    };

    const paletteColor = palettes[palette].rgb;
    const legendStyle = {
        '--legend-r': String(paletteColor[0]),
        '--legend-g': String(paletteColor[1]),
        '--legend-b': String(paletteColor[2]),
    } as Record<string, string>;
    const visibleRows = new Set(filteredYValues.map(item => item.key)).size;
    const visibleCols = new Set(filteredXValues).size;
    const totalVisibleLocations = visibleRows * visibleCols;

    return (
        <div className="transfer-heatmap-container" style={legendStyle}>
            {showControls && (
                <div className="heatmap-toolbar">
                    <div className="heatmap-toolbar-controls">
                        <label className="heatmap-tool">
                            <span>Intensity</span>
                            <select value={intensityMode} onChange={(e) => setIntensityMode((e.target as HTMLSelectElement).value as IntensityMode)}>
                                <option value="global">Global</option>
                                <option value="row">Per Y</option>
                                <option value="column">Per X</option>
                                <option value="log">Log</option>
                            </select>
                        </label>

                        <label className="heatmap-tool">
                            <span>Labels</span>
                            <select value={labelMode} onChange={(e) => setLabelMode((e.target as HTMLSelectElement).value as LabelMode)}>
                                <option value="count">Count</option>
                                <option value="percent">Percent</option>
                                <option value="both">Both</option>
                            </select>
                        </label>

                        <label className="heatmap-tool">
                            <span>Palette</span>
                            <select value={palette} onChange={(e) => setPalette((e.target as HTMLSelectElement).value as PaletteKey)}>
                                {Object.entries(palettes).map(([key, item]) => (
                                    <option key={key} value={key}>{item.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="heatmap-tool">
                            <span>Min</span>
                            <input
                                type="number"
                                min={1}
                                max={Math.max(1, data.maxCount)}
                                value={minCount}
                                onInput={(e) => {
                                    const value = Number((e.target as HTMLInputElement).value || 1);
                                    setMinCount(Math.min(Math.max(1, value), Math.max(1, data.maxCount)));
                                }}
                            />
                        </label>

                        <label className="heatmap-tool heatmap-tool-filter">
                            <span>Filter</span>
                            <input
                                type="text"
                                value={locationFilter}
                                placeholder="X012 / Z1-Y03"
                                onInput={(e) => setLocationFilter((e.target as HTMLInputElement).value)}
                            />
                        </label>

                        <label className="heatmap-tool heatmap-tool-checkbox">
                            <input
                                type="checkbox"
                                checked={showZeros}
                                onChange={(e) => setShowZeros((e.target as HTMLInputElement).checked)}
                            />
                            <span>Zeros</span>
                        </label>

                        <button className="heatmap-reset-btn" onClick={resetOptions}>
                            Reset
                        </button>
                    </div>
                </div>
            )}

            <div className="heatmap-view-split">
                {showControls && (
                    <aside className="heatmap-sidebar">
                        <div className="heatmap-stats-grid">
                            <div className="heatmap-stat-card">
                                <span>Rack IDs</span>
                                <strong>{data.rackCount.toLocaleString()}</strong>
                            </div>
                            <div className="heatmap-stat-card">
                                <span>Transfer Rows</span>
                                <strong>{data.transferRows.toLocaleString()}</strong>
                            </div>
                            <div className="heatmap-stat-card">
                                <span>Rack Hits</span>
                                <strong>{data.totalRackHits.toLocaleString()}</strong>
                            </div>
                            <div className="heatmap-stat-card">
                                <span>Visible Cells</span>
                                <strong>{visibleRackCells.toLocaleString()} / {totalVisibleLocations.toLocaleString()}</strong>
                            </div>
                        </div>
                    </aside>
                )}

                <div className="heatmap-content">
                    <div className="heatmap-scroll">
                        <table className="heatmap-table">
                            <thead>
                                <tr>
                                    <th className="sticky-col">Rack Y (Z+YY)</th>
                                    {filteredXValues.map(x => (
                                        <th key={x} title={formatX(x)}>{formatX(x)}</th>
                                    ))}
                                    <th className="summary-col" title="Total rack hits in this row">Row Total</th>
                                </tr>
                            </thead>
                    <tbody>
                        {filteredYValues.map((yAxis, index) => (
                            <Fragment key={yAxis.key}>
                                {index > 0 && filteredYValues[index - 1].z !== yAxis.z && (
                                        <tr className="z-separator-row" aria-hidden="true">
                                            <td colSpan={filteredXValues.length + 2}></td>
                                        </tr>
                                    )}
                                <tr>
                                    <th className="sticky-col" title={yAxis.label}>{yAxis.label}</th>
                                    {filteredXValues.map(x => {
                                        const count = data.matrix[yAxis.key]?.[x] || 0;
                                        const underThreshold = count > 0 && count < minCount;
                                        const visibleCount = underThreshold ? 0 : count;
                                        const intensity = intensityFor(yAxis.key, x, visibleCount);
                                        const alpha = visibleCount > 0 ? Math.max(0.22, intensity) : 0;
                                        const backgroundColor = visibleCount > 0
                                            ? `rgba(${paletteColor[0]}, ${paletteColor[1]}, ${paletteColor[2]}, ${alpha})`
                                            : 'transparent';
                                        const rackId = data.cellRackIds[yAxis.key]?.[x] || '';
                                        const isClickable = visibleCount > 0 && rackId !== '';
                                        const shouldShowLabel = visibleCount > 0 || showZeros;

                                        return (
                                            <td
                                                key={x}
                                                style={{ backgroundColor }}
                                                className={visibleCount > 0 ? 'has-data' : 'no-data'}
                                                onClick={() => isClickable && onCellClick?.(rackId)}
                                                title={`${rackId || `${formatX(x)} ${yAxis.label}`}: ${count} transfers`}
                                            >
                                                {shouldShowLabel ? formatLabel(visibleCount, intensity) : ''}
                                            </td>
                                        );
                                    })}
                                    <td className="summary-col" title={`Total for ${yAxis.label}`}>
                                        {(data.rowTotals[yAxis.key] || 0).toLocaleString()}
                                    </td>
                                </tr>
                            </Fragment>
                        ))}
                    </tbody>
                            <tfoot>
                                <tr>
                                    <th className="sticky-col">Column Total</th>
                                    {filteredXValues.map(x => (
                                        <th key={x} className="summary-col" title={`Total for ${formatX(x)}`}>
                                            {(data.colTotals[x] || 0).toLocaleString()}
                                        </th>
                                    ))}
                                    <th className="summary-col">{data.totalRackHits.toLocaleString()}</th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div className="heatmap-legend">
                        <span>Low</span>
                        <div className="legend-bar"></div>
                        <span>High</span>
                        <span className="total-count">
                            Mode: {intensityMode === 'global' ? 'Global max' : intensityMode === 'row' ? 'Per row' : intensityMode === 'column' ? 'Per column' : 'Log scale'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
