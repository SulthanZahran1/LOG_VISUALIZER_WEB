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
            // Note: Actual progress tracking would require XHR or fetch with streams
            // For now we just show a spinner/indeterminate progress
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
                        <span class="drop-icon spinning">🔄</span>
                        <p>Uploading {progress.value}%</p>
                    </>
                ) : (
                    <>
                        <span class="drop-icon">📁</span>
                        <p>Drag & drop a log file here</p>
                        <p class="drop-hint">or click to browse</p>
                    </>
                )}
            </div>

            {error.value && <div class="upload-error">{error.value}</div>}

            <style>{`
        .drop-zone.dragging {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
        }
        
        .drop-zone.uploading {
          cursor: wait;
          opacity: 0.7;
        }

        .upload-error {
          color: var(--accent-error);
          font-size: 13px;
          margin-top: var(--spacing-md);
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spinning {
          animation: spin 1s linear infinite;
          display: inline-block;
        }
      `}</style>
        </div>
    );
}
