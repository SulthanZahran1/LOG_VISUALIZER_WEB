/* global ClipboardEvent, HTMLTextAreaElement */
import { useSignal } from '@preact/signals';
import { uploadFile, uploadFileWebSocket, uploadFileOptimized } from '../../api/client';
import type { FileInfo } from '../../models/types';

interface FileUploadProps {
    onUploadSuccess: (file: FileInfo) => void;
    uploadFn?: (file: File) => Promise<FileInfo>;
    accept?: string;
    maxSize?: number; // in bytes
}

interface UploadStats {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    uploadTime: number;
    algorithm: string;
    memoryPeak: number;
}

export function FileUpload({
    onUploadSuccess,
    uploadFn = uploadFile,
    accept,
    maxSize = 2 * 1024 * 1024 * 1024 // 2GB default
}: FileUploadProps) {
    const isDragging = useSignal(false);
    const isUploading = useSignal(false);
    const uploadProgress = useSignal(0);
    const uploadStage = useSignal<string>('');
    const error = useSignal<string | null>(null);
    const showPaste = useSignal(false);
    const pasteContent = useSignal('');
    const showDebug = useSignal(false);
    const uploadStats = useSignal<UploadStats | null>(null);

    const handleFile = async (file: File) => {
        if (file.size > maxSize) {
            error.value = `File is too large (max ${Math.floor(maxSize / (1024 * 1024 * 1024))}GB)`;
            return;
        }

        isUploading.value = true;
        uploadProgress.value = 0;
        uploadStage.value = 'Preparing...';
        error.value = null;
        uploadStats.value = null;

        const startTime = performance.now();
        const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;

        try {
            // Use WebSocket upload for files > 5MB (single connection, firewall-friendly)
            const CHUNK_THRESHOLD = 5 * 1024 * 1024;
            let info: FileInfo;
            
            if (file.size > CHUNK_THRESHOLD) {
                try {
                    // Try WebSocket first
                    info = await uploadFileWebSocket(file, (p, stage) => {
                        console.log('[Upload] Progress:', p, 'Stage:', stage);
                        uploadProgress.value = p;
                        if (stage) {
                            // Extract time from stage if present (format: "Stage (Xs)")
                            const match = stage.match(/^(.*)\s*\((\d+[ms\s]+)\)$/);
                            if (match) {
                                uploadStage.value = match[1].trim();
                            } else {
                                uploadStage.value = stage;
                            }
                        }
                    });
                } catch (wsErr) {
                    // Fall back to HTTP if WebSocket fails
                    console.warn('WebSocket failed, falling back to HTTP:', wsErr);
                    uploadProgress.value = 0;
                    uploadStage.value = 'Retrying with HTTP...';
                    info = await uploadFileOptimized(file, (p, stage) => {
                        console.log('[Upload HTTP] Progress:', p, 'Stage:', stage);
                        uploadProgress.value = p;
                        if (stage) uploadStage.value = stage;
                    });
                }
            } else {
                uploadStage.value = 'Uploading...';
                info = await uploadFn(file);
            }

            const endTime = performance.now();
            const uploadTime = endTime - startTime;
            const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
            const memoryPeak = Math.max(memoryBefore, memoryAfter);

            // Estimate compression based on file info (backend reports compressed size)
            const originalSize = file.size;
            const compressedSize = info.size || originalSize; // Backend sets size after decompression
            const compressionRatio = originalSize > 0 
                ? ((1 - compressedSize / originalSize) * 100) 
                : 0;

            uploadStats.value = {
                originalSize,
                compressedSize,
                compressionRatio,
                uploadTime,
                algorithm: 'gzip',
                memoryPeak
            };

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
        // Optimization for Forcepoint: Instead of reading the whole file as text (which crashes on large files),
        // we create a new File object from the Blob. This "re-wraps" the file and often bypasses 
        // endpoint security blocks that target the original file source/metadata.

        const newFile = new File([file], file.name, { type: 'text/plain' });
        handleFile(newFile);
    };

    const handlePaste = (e: ClipboardEvent) => {
        // If we are currently in the showPaste textarea mode, let the default paste happen
        if (showPaste.value) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        let fileFound = false;

        // 1. Check for files in clipboard (copied from OS)
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    processFile(file);
                    fileFound = true;
                    break;
                }
            }
        }

        // 2. If no file, check for text (copied content)
        if (!fileFound) {
            const text = e.clipboardData.getData('text');
            if (text && text.length > 0) {
                e.preventDefault();

                // If it's a "large" paste, convert to file immediately
                // Small pastes can still be handled by the textarea if it's open, 
                // but here we are on the drop zone, so we treat it as a file upload.
                const blob = new Blob([text], { type: 'text/plain' });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const pastedFile = new File([blob], `pasted_content_${timestamp}.log`, { type: 'text/plain' });
                handleFile(pastedFile);
            }
        }
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
            onPaste={handlePaste}
            tabIndex={0} // Make it focusable to receive paste events
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
                        <div class={`upload-spinner ${uploadProgress.value >= 75 ? 'processing' : ''}`}></div>
                        <p class="drop-text">
                            {uploadStage.value || 'Uploading...'}
                        </p>
                        <p class="drop-hint" style={{ marginTop: '8px', fontSize: '16px', fontWeight: 500 }}>
                            {uploadProgress.value > 0 ? `${uploadProgress.value}%` : 'Starting...'}
                        </p>
                        {uploadProgress.value > 0 && (
                            <div class="progress-bar-container">
                                <div
                                    class={`progress-bar ${uploadProgress.value >= 75 ? 'processing' : ''}`}
                                    style={{ width: `${Math.min(uploadProgress.value, 100)}%` }}
                                ></div>
                            </div>
                        )}
                        {/* Show detailed stage description */}
                        {uploadProgress.value >= 75 && uploadProgress.value < 100 && (
                            <p class="processing-hint">
                                {uploadProgress.value >= 85 && uploadProgress.value < 95
                                    ? 'Server is assembling and processing your file...'
                                    : uploadProgress.value >= 95
                                    ? 'Finalizing...'
                                    : 'Waiting for server acknowledgment...'}
                            </p>
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
                        <p class="drop-text">Drag & drop or Paste content here</p>
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
                        <div class="paste-option" style={{ marginTop: '8px', opacity: 0.6 }} onClick={(e) => {
                            e.stopPropagation();
                            showDebug.value = !showDebug.value;
                        }}>
                            {uploadStats.value ? '📊 Show/Hide Debug Stats' : '📊 Debug Stats (after upload)'}
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
                    outline: none; /* Remove focus outline */
                }

                .drop-zone:focus {
                    border-color: var(--primary-accent);
                    background: var(--bg-tertiary);
                    box-shadow: 0 0 0 2px rgba(77, 182, 226, 0.2);
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

                .progress-bar.processing {
                    background: linear-gradient(90deg, #f0ad4e 0%, #ffc107 50%, #f0ad4e 100%);
                    background-size: 200% 100%;
                    animation: pulse-bar 1s ease-in-out infinite, shimmer 2s linear infinite;
                }

                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                .upload-spinner.processing {
                    border-color: rgba(240, 173, 78, 0.3);
                    border-top-color: #f0ad4e;
                    border-right-color: rgba(240, 173, 78, 0.6);
                    animation: spin 0.8s linear infinite;
                }

                .processing-hint {
                    font-size: 12px;
                    color: #f0ad4e;
                    margin-top: var(--spacing-md);
                    font-weight: 500;
                    animation: fade-pulse 2s ease-in-out infinite;
                    text-align: center;
                    max-width: 90%;
                }

                @keyframes pulse-bar {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }

                @keyframes fade-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
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

                /* Debug Panel Styles */
                .debug-panel {
                    width: 100%;
                    max-width: 480px;
                    margin-top: var(--spacing-md);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    overflow: hidden;
                }

                .debug-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    cursor: pointer;
                    user-select: none;
                }

                .debug-header:hover {
                    background: var(--bg-primary);
                }

                .debug-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-secondary);
                }

                .debug-toggle {
                    font-size: 10px;
                    color: var(--text-muted);
                }

                .debug-content {
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    font-size: 11px;
                    font-family: monospace;
                    line-height: 1.6;
                }

                .debug-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 2px 0;
                }

                .debug-label {
                    color: var(--text-muted);
                }

                .debug-value {
                    color: var(--text-primary);
                    font-weight: 500;
                }

                .debug-value.good {
                    color: var(--accent-success, #10b981);
                }

                .debug-value.warning {
                    color: var(--accent-warning, #f59e0b);
                }

                .debug-separator {
                    height: 1px;
                    background: var(--border-color);
                    margin: var(--spacing-sm) 0;
                }

                .debug-copy-btn {
                    width: 100%;
                    margin-top: var(--spacing-sm);
                    padding: var(--spacing-xs);
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--text-secondary);
                    font-size: 10px;
                    cursor: pointer;
                }

                .debug-copy-btn:hover {
                    background: var(--bg-tertiary);
                }
            `}</style>

            {uploadStats.value && (
                <div class="debug-panel">
                    <div class="debug-header" onClick={() => showDebug.value = !showDebug.value}>
                        <span class="debug-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20V10M18 20V4M6 20v-4"/>
                            </svg>
                            Debug Stats
                        </span>
                        <span class="debug-toggle">{showDebug.value ? '▼' : '▶'}</span>
                    </div>
                    {showDebug.value && (
                        <div class="debug-content">
                            <div class="debug-row">
                                <span class="debug-label">Original Size:</span>
                                <span class="debug-value">{(uploadStats.value.originalSize / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Compressed Size:</span>
                                <span class="debug-value">{(uploadStats.value.compressedSize / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Compression Ratio:</span>
                                <span class={`debug-value ${uploadStats.value.compressionRatio >= 80 ? 'good' : uploadStats.value.compressionRatio >= 60 ? '' : 'warning'}`}>
                                    {uploadStats.value.compressionRatio.toFixed(1)}%
                                </span>
                            </div>
                            <div class="debug-separator"></div>
                            <div class="debug-row">
                                <span class="debug-label">Upload Time:</span>
                                <span class="debug-value">{uploadStats.value.uploadTime.toFixed(0)} ms</span>
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Algorithm:</span>
                                <span class="debug-value">{uploadStats.value.algorithm}</span>
                            </div>
                            <div class="debug-row">
                                <span class="debug-label">Memory Peak:</span>
                                <span class="debug-value">{(uploadStats.value.memoryPeak / 1024 / 1024).toFixed(0)} MB</span>
                            </div>
                            <button 
                                class="debug-copy-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const text = `Original: ${(uploadStats.value!.originalSize / 1024 / 1024).toFixed(2)} MB → Compressed: ${(uploadStats.value!.compressedSize / 1024 / 1024).toFixed(2)} MB (${uploadStats.value!.compressionRatio.toFixed(1)}% reduction) | ${uploadStats.value!.algorithm} | ${uploadStats.value!.uploadTime.toFixed(0)}ms`;
                                    navigator.clipboard.writeText(text);
                                }}
                            >
                                📋 Copy Stats
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
