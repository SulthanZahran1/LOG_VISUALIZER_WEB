import type { FileInfo } from '../../models/types';

interface RecentFilesProps {
  files: FileInfo[];
  onFileSelect: (file: FileInfo) => void;
  onFileDelete: (id: string) => void;
}

export function RecentFiles({ files, onFileSelect, onFileDelete }: RecentFilesProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div class="recent-files">
      <div class="recent-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        Recent Files
      </div>
      <div class="file-list">
        {files.length === 0 ? (
          <div class="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>No recent files</span>
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} class="file-item" onClick={() => onFileSelect(file)}>
              <div class="file-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
              </div>
              <div class="file-info">
                <span class="file-name">{file.name}</span>
                <span class="file-meta">
                  {formatSize(file.size)} • {formatDate(file.uploadedAt)}
                </span>
              </div>
              <button
                class="btn-delete"
                onClick={(e) => { e.stopPropagation(); onFileDelete(file.id); }}
                title="Delete file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <style>{`
                .recent-files {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }

                .recent-header {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                    font-weight: 600;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    background: var(--bg-tertiary);
                }

                .file-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-xl);
                    color: var(--text-muted);
                    font-size: 12px;
                    height: 100%;
                }

                .empty-state svg {
                    opacity: 0.3;
                }

                .file-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    cursor: pointer;
                    transition: background var(--transition-fast);
                }

                .file-item:last-child {
                    border-bottom: none;
                }

                .file-item:hover {
                    background: var(--bg-hover);
                }

                .file-icon {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .file-item:hover .file-icon {
                    color: var(--primary-accent);
                }

                .file-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                    flex: 1;
                }

                .file-name {
                    font-size: 13px;
                    color: var(--text-primary);
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .file-meta {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .btn-delete {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 4px;
                    transition: all var(--transition-fast);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                }

                .file-item:hover .btn-delete {
                    opacity: 1;
                }

                .btn-delete:hover {
                    color: var(--accent-error);
                    background: rgba(248, 81, 73, 0.15);
                }
            `}</style>
    </div>
  );
}
