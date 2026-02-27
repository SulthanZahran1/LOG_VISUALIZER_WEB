import { useMemo } from 'preact/hooks';
import { logEntries, totalEntries } from '../../stores/logStore';
import './TransferHeatmap.css';

interface TransferHeatmapProps {
    onCellClick?: (source: string, dest: string) => void;
}

export function TransferHeatmap({ onCellClick }: TransferHeatmapProps) {
    const data = useMemo(() => {
        const matrix: Record<string, Record<string, number>> = {};
        const sources = new Set<string>();
        const dests = new Set<string>();

        // We only process entries where SignalName is "Transfer"
        // Value format: CommandID|Status|Source|Dest|CurrLoc|Result
        logEntries.value.forEach(entry => {
            if (entry.signalName === 'Transfer') {
                const parts = String(entry.value).split('|');
                if (parts.length >= 4) {
                    const source = parts[2] || 'UNKNOWN';
                    const dest = parts[3] || 'UNKNOWN';
                    
                    if (source === 'UNKNOWN' && dest === 'UNKNOWN') return;

                    sources.add(source);
                    dests.add(dest);

                    if (!matrix[source]) matrix[source] = {};
                    matrix[source][dest] = (matrix[source][dest] || 0) + 1;
                }
            }
        });

        const sortedSources = Array.from(sources).sort();
        const sortedDests = Array.from(dests).sort();

        let maxCount = 0;
        Object.values(matrix).forEach(row => {
            Object.values(row).forEach(count => {
                if (count > maxCount) maxCount = count;
            });
        });

        return { matrix, sources: sortedSources, dests: sortedDests, maxCount };
    }, [logEntries.value]);

    if (data.sources.length === 0 || data.dests.length === 0) {
        return (
            <div className="transfer-heatmap-empty">
                No transfer data available for heatmap. {logEntries.value.length === 0 ? "(Loading...)" : ""}
            </div>
        );
    }

    return (
        <div className="transfer-heatmap-container">
            <div className="heatmap-scroll">
                <table className="heatmap-table">
                    <thead>
                        <tr>
                            <th className="sticky-col">Source \ Dest</th>
                            {data.dests.map(dest => (
                                <th key={dest} title={dest}>{dest}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.sources.map(source => (
                            <tr key={source}>
                                <th className="sticky-col" title={source}>{source}</th>
                                {data.dests.map(dest => {
                                    const count = data.matrix[source]?.[dest] || 0;
                                    const intensity = data.maxCount > 0 ? count / data.maxCount : 0;
                                    const backgroundColor = intensity > 0 
                                        ? `rgba(156, 39, 176, ${0.1 + intensity * 0.9})` 
                                        : 'transparent';
                                    
                                    return (
                                        <td 
                                            key={dest}
                                            style={{ backgroundColor }}
                                            className={count > 0 ? 'has-data' : ''}
                                            onClick={() => count > 0 && onCellClick?.(source, dest)}
                                            title={`${source} -> ${dest}: ${count} transfers`}
                                        >
                                            {count > 0 ? count : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="heatmap-legend">
                <span>Low</span>
                <div className="legend-bar"></div>
                <span>High</span>
                <span className="total-count">Total Entries: {totalEntries.value}</span>
            </div>
        </div>
    );
}
