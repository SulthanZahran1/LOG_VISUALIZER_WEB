import type { UploadStats } from '../hooks';

interface DebugStatsPanelProps {
    stats: UploadStats;
    showDetails: boolean;
    onToggle: () => void;
}

function formatBytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatDuration(ms: number): string {
    return ms.toFixed(0) + ' ms';
}

function getCompressionClass(ratio: number): string {
    if (ratio >= 80) return 'good';
    if (ratio >= 60) return '';
    return 'warning';
}

export function DebugStatsPanel({ stats, showDetails, onToggle }: DebugStatsPanelProps) {
    const handleCopy = (e: MouseEvent) => {
        e.stopPropagation();
        const text = `Original: ${formatBytes(stats.originalSize)} → Compressed: ${formatBytes(stats.compressedSize)} (${stats.compressionRatio.toFixed(1)}% reduction) | ${stats.algorithm} | ${formatDuration(stats.uploadTime)}`;
        navigator.clipboard.writeText(text);
    };

    return (
        <div class="debug-panel">
            <div class="debug-header" onClick={onToggle}>
                <span class="debug-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20V10M18 20V4M6 20v-4"/>
                    </svg>
                    Debug Stats
                </span>
                <span class="debug-toggle">{showDetails ? '▼' : '▶'}</span>
            </div>
            {showDetails && (
                <div class="debug-content">
                    <div class="debug-row">
                        <span class="debug-label">Original Size:</span>
                        <span class="debug-value">{formatBytes(stats.originalSize)}</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Compressed Size:</span>
                        <span class="debug-value">{formatBytes(stats.compressedSize)}</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Compression Ratio:</span>
                        <span class={`debug-value ${getCompressionClass(stats.compressionRatio)}`}>
                            {stats.compressionRatio.toFixed(1)}%
                        </span>
                    </div>
                    <div class="debug-separator"></div>
                    <div class="debug-row">
                        <span class="debug-label">Upload Time:</span>
                        <span class="debug-value">{formatDuration(stats.uploadTime)}</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Algorithm:</span>
                        <span class="debug-value">{stats.algorithm}</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Memory Peak:</span>
                        <span class="debug-value">{(stats.memoryPeak / 1024 / 1024).toFixed(0)} MB</span>
                    </div>
                    <button class="debug-copy-btn" onClick={handleCopy}>
                        📋 Copy Stats
                    </button>
                </div>
            )}
        </div>
    );
}

export default DebugStatsPanel;
