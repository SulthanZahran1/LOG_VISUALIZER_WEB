import { useSignal } from '@preact/signals';
import { uploadFile, uploadFileChunked } from '../../api/client';
import type { FileInfo } from '../../models/types';

interface FileUploadProps {
    onUploadSuccess: (file: FileInfo) => void;
    uploadFn?: (file: File) => Promise<FileInfo>;
    accept?: string;
    maxSize?: number; // in bytes
}

export function FileUpload({
    onUploadSuccess,
    uploadFn = uploadFile,
    accept,
    maxSize = 1024 * 1024 * 1024 // 1GB default
}: FileUploadProps) {
    const isDragging = useSignal(false);
    const isUploading = useSignal(false);
    const uploadProgress = useSignal(0);
    const error = useSignal<string | null>(null);
    const showPaste = useSignal(false);
    const pasteContent = useSignal('');

    const handleFile = async (file: File) => {
        if (file.size > maxSize) {
            error.value = `File is too large (max ${Math.floor(maxSize / (1024 * 1024 * 1024))}GB)`;
            return;
        }

        isUploading.value = true;
        uploadProgress.value = 0;
        error.value = null;

        try {
            // Use chunked upload for files > 5MB
            const CHUNK_THRESHOLD = 5 * 1024 * 1024;
            const info = file.size > CHUNK_THRESHOLD
                ? await uploadFileChunked(file, (p) => uploadProgress.value = p)
                : await uploadFn(file);

            onUploadSuccess(info);
            // Reset state
            showPaste.value = false;
            pasteContent.value = '';
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Upload failed';
        } finally {
            isUploading.value = false;
            uploadProgress.value = 0;
        }
    };

    const processFile = (file: File) => {
        // For large files, skip the "read as text" logic as it crashes the browser
        const LARGE_FILE_LIMIT = 50 * 1024 * 1024; // 50MB
        if (file.size > LARGE_FILE_LIMIT) {
            handleFile(file);
            return;
        }

        // Keep the "read and paste" behavior only for smaller files if requested
        isUploading.value = true;
        error.value = null;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                const blob = new Blob([content], { type: 'text/plain' });
                const newFile = new File([blob], file.name, { type: 'text/plain' });
                handleFile(newFile);
            } else {
                handleFile(file); // Fallback to direct upload
            }
        };
        reader.onerror = () => {
            handleFile(file);
        };
        reader.readAsText(file);
    };

    const handlePasteUpload = () => {
        if (!pasteContent.value.trim()) {
            error.value = 'Please paste some content first';
            return;
        }

        const blob = new Blob([pasteContent.value], { type: 'text/plain' });
        const file = new File([blob], `pasted_log_${new Date().toISOString()}.txt`, { type: 'text/plain' });
        handleFile(file);
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
        if (file) processFile(file);
    };

    const onFileSelect = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) processFile(file);
    };

    return (
        <div
            class={`drop-zone ${isDragging.value ? 'dragging' : ''} ${isUploading.value ? 'uploading' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => {
                if (!isUploading.value && !showPaste.value) {
                    document.getElementById('file-input')?.click();
                }
            }}
        >
            <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={onFileSelect}
                disabled={isUploading.value}
                accept={accept}
            />

            <div class="drop-zone-content">
                {isUploading.value ? (
                    <>
                        <div class="upload-spinner"></div>
                        <p class="drop-text">Uploading... {uploadProgress.value > 0 ? `${uploadProgress.value}%` : ''}</p>
                        {uploadProgress.value > 0 && (
                            <div class="progress-bar-container">
                                <div class="progress-bar" style={{ width: `${uploadProgress.value}%` }}></div>
                            </div>
                        )}
                    </>
                ) : showPaste.value ? (
                    <div class="paste-area" onClick={(e) => e.stopPropagation()}>
                        <textarea
                            value={pasteContent.value}
                            onInput={(e) => pasteContent.value = (e.target as HTMLTextAreaElement).value}
                            placeholder="Paste log content here..."
                            rows={10}
                        />
                        <div class="paste-actions">
                            <button class="btn-cancel" onClick={() => showPaste.value = false}>Cancel</button>
                            <button class="btn-upload" onClick={handlePasteUpload}>Upload Text</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div class="drop-icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17,8 12,3 7,8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <p class="drop-text">Drag & drop a file here</p>
                        <p class="drop-hint">or click to browse</p>
                        <div class="drop-formats">
                            {accept ? `Supports ${accept.split(',').join(', ')}` : 'Supports .log, .txt, .csv files'}
                            {maxSize ? ` · up to ${Math.floor(maxSize / (1024 * 1024 * 1024))}GB` : ''}
                        </div>
                        <div class="paste-option" onClick={(e) => {
                            e.stopPropagation();
                            showPaste.value = true;
                            error.value = null;
                        }}>
                            or paste text content
                        </div>
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
                    max-width: 480px; /* Increased width to accommodate textarea */
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
                    width: 100%;
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

                .progress-bar-container {
                    width: 80%;
                    height: 4px;
                    background: var(--bg-primary);
                    border-radius: 2px;
                    margin-top: var(--spacing-sm);
                    overflow: hidden;
                }

                .progress-bar {
                    height: 100%;
                    background: var(--primary-accent);
                    transition: width 0.3s ease;
                }

                .paste-option {
                    margin-top: var(--spacing-md);
                    font-size: 12px;
                    color: var(--primary-accent);
                    text-decoration: underline;
                    cursor: pointer;
                    opacity: 0.8;
                }
                .paste-option:hover {
                    opacity: 1;
                }

                .paste-area {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                    width: 100%;
                }

                .paste-area textarea {
                    width: 100%;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: var(--spacing-sm);
                    color: var(--text-primary);
                    font-family: monospace;
                    font-size: 12px;
                    resize: vertical;
                }
                
                .paste-area textarea:focus {
                    outline: none;
                    border-color: var(--primary-accent);
                }

                .paste-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--spacing-sm);
                }

                .btn-cancel, .btn-upload {
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                }

                .btn-cancel {
                    background: transparent;
                    color: var(--text-muted);
                    border: 1px solid var(--border-color);
                }
                .btn-cancel:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .btn-upload {
                    background: var(--primary-accent);
                    color: white;
                }
                .btn-upload:hover {
                    filter: brightness(1.1);
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
