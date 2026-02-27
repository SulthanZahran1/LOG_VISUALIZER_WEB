import type { ParseSession, FileInfo } from '../../models/types';
import { currentSession, totalEntries, isStreaming, streamProgress } from '../../stores/logStore';

interface LoadedFileCardProps {
    recentFiles: FileInfo[];
    onUnload: () => void;
}

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusLabel(session: ParseSession): string {
    switch (session.status) {
        case 'pending': return 'Starting...';
        case 'parsing': return `Parsing ${Math.floor(session.progress || 0)}%`;
        case 'complete': return 'Ready';
        case 'error': return 'Error';
        default: return session.status;
    }
}

export function LoadedFileCard({ recentFiles, onUnload }: LoadedFileCardProps) {
    const session = currentSession.value;
    const entries = totalEntries.value;
    const streaming = isStreaming.value;
    const progress = streamProgress.value;

    // Look up file info from recentFiles using session's fileId
    const fileInfo = session ? recentFiles.find(f => f.id === session.fileId) : null;
    
    // Check if this is a merged session (multiple files)
    const isMergedSession = session?.fileIds && session.fileIds.length > 1;
    const mergedFileCount = session?.fileIds?.length || 1;

    if (!session) {
        return (
            <div class="loaded-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span class="empty-title">No file loaded</span>
                <span class="empty-hint">Upload or select a file from Recent to get started</span>

                <style>{`
                    .loaded-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: var(--spacing-sm);
                        padding: var(--spacing-xl);
                        color: var(--text-muted);
                        height: 100%;
                        text-align: center;
                    }
                    .loaded-empty svg {
                        opacity: 0.3;
                    }
                    .empty-title {
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--text-secondary);
                    }
                    .empty-hint {
                        font-size: 12px;
                    }
                `}</style>
            </div>
        );
    }

    const isParsing = session.status === 'pending' || session.status === 'parsing';
    const showProgress = isParsing || streaming;
    const progressValue = streaming ? progress : (session.progress || 0);

    return (
        <div class="loaded-card">
            <div class="loaded-header">
                <div class="loaded-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                    </svg>
                </div>
                <div class="loaded-info">
                    <span class="loaded-name">
                        {isMergedSession 
                            ? `Merged (${mergedFileCount} files)` 
                            : (fileInfo?.name || session.fileId || 'Untitled')}
                    </span>
                    <span class="loaded-meta">
                        {fileInfo && !isMergedSession ? formatSize(fileInfo.size) : ''}
                        {entries > 0 && ` • ${entries.toLocaleString()} entries`}
                    </span>
                </div>
                <div class={`loaded-status status-${session.status}`}>
                    {getStatusLabel(session)}
                </div>
                <button class="btn-unload" onClick={onUnload} title="Unload file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {showProgress && (
                <div class="progress-container">
                    <div class="progress-bar" style={{ width: `${progressValue}%` }}></div>
                </div>
            )}

            <style>{`
                .loaded-card {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    height: 100%;
                }

                .loaded-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .loaded-icon {
                    width: 36px;
                    height: 36px;
                    background: var(--bg-primary);
                    border-radius: var(--border-radius);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-accent);
                    flex-shrink: 0;
                }

                .loaded-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex: 1;
                    min-width: 0;
                }

                .loaded-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .loaded-meta {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .loaded-status {
                    font-size: 11px;
                    font-weight: 500;
                    padding: 4px 8px;
                    border-radius: 4px;
                    text-transform: capitalize;
                }

                .loaded-status.status-pending,
                .loaded-status.status-parsing {
                    background: rgba(210, 153, 34, 0.15);
                    color: var(--accent-warning);
                }

                .loaded-status.status-complete {
                    background: rgba(63, 185, 80, 0.15);
                    color: var(--accent-success);
                }

                .loaded-status.status-error {
                    background: rgba(248, 81, 73, 0.15);
                    color: var(--accent-error);
                }

                .btn-unload {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all var(--transition-fast);
                }

                .btn-unload:hover {
                    color: var(--accent-error);
                    background: rgba(248, 81, 73, 0.15);
                }

                .progress-container {
                    height: 4px;
                    background: var(--bg-primary);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .progress-bar {
                    height: 100%;
                    background: var(--primary-accent);
                    transition: width 0.3s ease;
                }
            `}</style>
        </div>
    );
}
