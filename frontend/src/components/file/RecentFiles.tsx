
import type { FileInfo } from '../../models/types';
import { useState } from 'preact/hooks';

interface RecentFilesProps {
  files: FileInfo[];
  onFileSelect: (file: FileInfo) => void;
  onFileDelete?: (id: string) => void;
  onFileRename?: (id: string, newName: string) => Promise<void>;
  title?: string;
  className?: string;
  hideIcon?: boolean;
  // Multi-select mode
  multiSelect?: boolean;
  onMultiSelect?: (files: FileInfo[]) => void;
  multiSelectLabel?: string;
}

export function RecentFiles({
  files,
  onFileSelect,
  onFileDelete,
  onFileRename,
  title = "Recent Files",
  className = "",
  hideIcon = false,
  multiSelect = false,
  onMultiSelect,
  multiSelectLabel = "Merge Selected"
}: RecentFilesProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleStartEdit = (e: Event, file: FileInfo) => {
    e.stopPropagation();
    setEditingId(file.id);
    setEditName(file.name);
  };

  const handleSaveEdit = async (e: Event) => {
    e.stopPropagation();
    if (editingId && onFileRename && editName.trim()) {
      await onFileRename(editingId, editName.trim());
      setEditingId(null);
    }
  };

  const handleCancelEdit = (e: Event) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const toggleSelection = (fileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleMerge = () => {
    if (onMultiSelect && selectedIds.size > 0) {
      const selectedFiles = files.filter(f => selectedIds.has(f.id));
      onMultiSelect(selectedFiles);
      setSelectedIds(new Set());
    }
  };

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
    <div class={`recent-files ${className}`}>
      <div class="recent-header">
        {!hideIcon && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
        )}
        {title}
      </div>
      <div class="file-list">
        {files.length === 0 ? (
          <div class="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>No {title.toLowerCase()}</span>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              class={`file-item ${editingId === file.id ? 'editing' : ''} ${selectedIds.has(file.id) ? 'selected' : ''}`}
              onClick={(e: MouseEvent) => {
                if (editingId) return;

                // Ctrl+Click or checkbox click for multi-select
                if (multiSelect && (e.ctrlKey || e.metaKey)) {
                  toggleSelection(file.id);
                } else if (selectedIds.size > 0 && multiSelect) {
                  // If items are already selected, clicking adds to selection
                  toggleSelection(file.id);
                } else {
                  // Normal single-click: open file immediately
                  onFileSelect(file);
                }
              }}
            >
              {multiSelect && (
                <input
                  type="checkbox"
                  class="file-checkbox"
                  checked={selectedIds.has(file.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelection(file.id)}
                />
              )}
              <div class="file-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
              </div>
              <div class="file-info">
                {editingId === file.id ? (
                  <div class="edit-mode" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(e);
                        if (e.key === 'Escape') handleCancelEdit(e);
                      }}
                      autoFocus
                    />
                    <button class="btn-icon btn-save" onClick={handleSaveEdit} title="Save">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button class="btn-icon btn-cancel" onClick={handleCancelEdit} title="Cancel">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <span class="file-name">{file.name}</span>
                    <span class="file-meta">
                      {formatSize(file.size)} • {formatDate(file.uploadedAt)}
                    </span>
                  </>
                )}
              </div>
              {!editingId && (
                <div class="file-actions">
                  {onFileRename && (
                    <button
                      class="btn-action"
                      onClick={(e) => handleStartEdit(e, file)}
                      title="Rename file"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}
                  {onFileDelete && (
                    <button
                      class="btn-action btn-delete"
                      onClick={(e) => { e.stopPropagation(); onFileDelete(file.id); }}
                      title="Delete file"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {multiSelect && selectedIds.size > 0 && (
        <div class="merge-bar">
          <span class="merge-count">{selectedIds.size} file{selectedIds.size > 1 ? 's' : ''} selected</span>
          <button class="btn-merge" onClick={handleMerge}>
            {multiSelectLabel}
          </button>
        </div>
      )}

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
                    height: 48px;
                }

                .file-item:last-child {
                    border-bottom: none;
                }

                .file-item:hover, .file-item.editing {
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
                    justify-content: center;
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

                .file-actions {
                    display: flex;
                    gap: 4px;
                    opacity: 0;
                    transition: opacity var(--transition-fast);
                }

                .file-item:hover .file-actions {
                    opacity: 1;
                }

                .btn-action {
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

                .btn-action:hover {
                    color: var(--text-primary);
                    background: var(--bg-tertiary);
                }

                .btn-action.btn-delete:hover {
                    color: var(--accent-error);
                    background: rgba(248, 81, 73, 0.15);
                }

                .edit-mode {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    width: 100%;
                }

                .edit-mode input {
                    flex: 1;
                    min-width: 0;
                    background: var(--bg-primary);
                    border: 1px solid var(--primary-accent);
                    border-radius: 2px;
                    padding: 2px 4px;
                    color: var(--text-primary);
                    font-size: 13px;
                }

                .btn-icon {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .btn-save {
                    color: var(--accent-success);
                }
                .btn-save:hover {
                    background: rgba(46, 160, 67, 0.15);
                }

                .btn-cancel {
                    color: var(--text-muted);
                }
                .btn-cancel:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .file-checkbox {
                    width: 16px;
                    height: 16px;
                    accent-color: var(--primary-accent);
                    cursor: pointer;
                    flex-shrink: 0;
                }

                .file-item.selected {
                    background: rgba(77, 182, 226, 0.1);
                    border-left: 2px solid var(--primary-accent);
                }

                .merge-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }

                .merge-count {
                    font-size: 12px;
                    color: var(--text-muted);
                }

                .btn-merge {
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    background: var(--primary-accent);
                    color: white;
                }
                .btn-merge:hover {
                    filter: brightness(1.1);
                }
            `}</style>
    </div>
  );
}
