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
        return new Date(dateStr).toLocaleString();
    };

    if (files.length === 0) {
        return null;
    }

    return (
        <div class="recent-files">
            <h3>Recent Files</h3>
            <div class="file-list">
                {files.map((file) => (
                    <div key={file.id} class="file-item" onClick={() => onFileSelect(file)}>
                        <div class="file-info">
                            <span class="file-name">{file.name}</span>
                            <span class="file-meta">
                                {formatSize(file.size)} • {formatDate(file.uploadedAt)}
                            </span>
                        </div>
                        <div class="file-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                                class="btn-delete"
                                onClick={() => onFileDelete(file.id)}
                                title="Delete file"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
        .recent-files {
          margin-top: var(--spacing-xl);
          width: 100%;
          text-align: left;
        }

        .recent-files h3 {
          font-size: 14px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--spacing-md);
        }

        .file-list {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          overflow: hidden;
        }

        .file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-md) var(--spacing-lg);
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

        .file-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .file-name {
          font-size: 14px;
          color: var(--text-primary);
          font-weight: 500;
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
          font-size: 16px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all var(--transition-fast);
        }

        .btn-delete:hover {
          color: var(--accent-error);
          background: rgba(239, 68, 68, 0.1);
        }
      `}</style>
        </div>
    );
}
