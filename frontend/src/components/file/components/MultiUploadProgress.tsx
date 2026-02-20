import type { UploadQueueItem } from '../hooks';

interface MultiUploadProgressProps {
    queue: UploadQueueItem[];
    overallProgress: number;
}

function StatusIcon({ status }: { status: UploadQueueItem['status'] }) {
    switch (status) {
        case 'pending':
            return <span class="status-dot pending"></span>;
        case 'uploading':
            return <span class="status-spinner"></span>;
        case 'complete':
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            );
        case 'error':
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            );
        default:
            return null;
    }
}

export function MultiUploadProgress({ queue, overallProgress }: MultiUploadProgressProps) {
    return (
        <div class="multi-upload-progress">
            <div class="multi-upload-header">
                <div class="upload-spinner"></div>
                <span class="multi-upload-title">
                    Uploading {queue.length} files...
                </span>
            </div>
            <div class="multi-upload-bar">
                <div
                    class="multi-progress-fill"
                    style={{ width: `${overallProgress}%` }}
                ></div>
            </div>
            <span class="multi-progress-text">{overallProgress}%</span>

            <div class="upload-queue">
                {queue.map((item) => (
                    <div key={item.id} class={`queue-item ${item.status}`}>
                        <div class="queue-status-icon">
                            <StatusIcon status={item.status} />
                        </div>
                        <span class="queue-filename">{item.file.name}</span>
                        <span class="queue-filesize">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        {item.status === 'uploading' && (
                            <span class="queue-percent">{item.progress}%</span>
                        )}
                        {item.status === 'complete' && (
                            <span class="queue-status-text success">Done</span>
                        )}
                        {item.status === 'error' && (
                            <span class="queue-status-text error" title={item.error}>Failed</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default MultiUploadProgress;
