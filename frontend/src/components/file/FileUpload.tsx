import { useSignal } from '@preact/signals';
import { uploadFile } from '../../api/client';
import type { FileInfo } from '../../models/types';

interface FileUploadProps {
    onUploadSuccess: (file: FileInfo) => void;
}

export function FileUpload({ onUploadSuccess }: FileUploadProps) {
    const isDragging = useSignal(false);
    const isUploading = useSignal(false);
    const error = useSignal<string | null>(null);
    const progress = useSignal(0);

    const handleFile = async (file: File) => {
        if (file.size > 1024 * 1024 * 1024) {
            error.value = 'File is too large (max 1GB)';
            return;
        }

        isUploading.value = true;
        error.value = null;
        progress.value = 0;

        try {
            const info = await uploadFile(file);
            onUploadSuccess(info);
        } catch (err: any) {
            error.value = err.message || 'Upload failed';
        } finally {
            isUploading.value = false;
        }
    };

    const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        isDragging.value = true;
    };

    const onDragLeave = () => {
        isDragging.value = false;
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        isDragging.value = false;
        const file = e.dataTransfer?.files[0];
        if (file) handleFile(file);
    };

    const onFileSelect = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div
            class={`drop-zone ${isDragging.value ? 'dragging' : ''} ${isUploading.value ? 'uploading' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !isUploading.value && document.getElementById('file-input')?.click()}
        >
            <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={onFileSelect}
                disabled={isUploading.value}
            />

            <div class="drop-zone-content">
                {isUploading.value ? (
                    <>
                        <div class="upload-spinner"></div>
                        <p class="drop-text">Uploading...</p>
                    </>
                ) : (
                    <>
                        <div class="drop-icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17,8 12,3 7,8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <p class="drop-text">Drag & drop a log file here</p>
                        <p class="drop-hint">or click to browse</p>
                        <div class="drop-formats">Supports .log, .txt, .csv files up to 1GB</div>
                    </>
                )}
            </div>

            {error.value && (
                <div class="upload-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error.value}
                </div>
            )}

            <style>{`
                .drop-zone {
                    width: 100%;
                    max-width: 320px;
                    padding: var(--spacing-xl);
                    border: 2px dashed var(--border-color);
                    border-radius: var(--card-radius);
                    background: var(--bg-secondary);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    text-align: center;
                }

                .drop-zone:hover {
                    border-color: var(--primary-accent);
                    background: var(--bg-tertiary);
                }

                .drop-zone.dragging {
                    border-color: var(--primary-accent);
                    background: rgba(77, 182, 226, 0.1);
                    border-style: solid;
                }

                .drop-zone.uploading {
                    cursor: wait;
                    pointer-events: none;
                }

                .drop-zone-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .drop-icon {
                    color: var(--text-muted);
                    transition: all var(--transition-fast);
                }

                .drop-zone:hover .drop-icon {
                    color: var(--primary-accent);
                    transform: translateY(-2px);
                }

                .drop-text {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                    margin: 0;
                }

                .drop-hint {
                    font-size: 12px;
                    color: var(--text-muted);
                    margin: 0;
                }

                .drop-formats {
                    font-size: 10px;
                    color: var(--text-muted);
                    margin-top: var(--spacing-sm);
                    padding: var(--spacing-xs) var(--spacing-sm);
                    background: var(--bg-primary);
                    border-radius: 4px;
                }

                .upload-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--border-color);
                    border-top-color: var(--primary-accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                .upload-error {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--accent-error);
                    font-size: 12px;
                    margin-top: var(--spacing-md);
                    padding: var(--spacing-sm);
                    background: rgba(248, 81, 73, 0.1);
                    border-radius: 4px;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
