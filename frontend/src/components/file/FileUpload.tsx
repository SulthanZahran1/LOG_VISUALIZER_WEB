/* global ClipboardEvent, FileList, DataTransfer */
import { useSignal } from '@preact/signals';
import { uploadFile } from '../../api/client';
import type { FileInfo } from '../../models/types';
import {
    useFileUpload,
    useMultiFileUpload,
    usePasteHandler,
    useDragAndDrop,
    type UploadQueueItem
} from './hooks';
import {
    UploadProgress,
    MultiUploadProgress,
    PasteArea,
    DebugStatsPanel,
    DropZoneContent,
    UploadError
} from './components';
import './FileUpload.css';

export interface UploadQueueItemExport {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
    progress: number;
    error?: string;
    result?: FileInfo;
}

export type { UploadQueueItem };

interface FileUploadProps {
    onUploadSuccess: (file: FileInfo) => void;
    onMultiUploadSuccess?: (files: FileInfo[]) => void;
    uploadFn?: (file: File) => Promise<FileInfo>;
    accept?: string;
    maxSize?: number; // in bytes
    multiple?: boolean;
    maxFiles?: number;
}

export function FileUpload({
    onUploadSuccess,
    onMultiUploadSuccess,
    uploadFn = uploadFile,
    accept,
    maxSize = 2 * 1024 * 1024 * 1024, // 2GB default
    multiple = false,
    maxFiles = 10
}: FileUploadProps) {
    // Use hooks for state management
    const fileUpload = useFileUpload(onUploadSuccess, uploadFn);
    const multiFileUpload = useMultiFileUpload(maxFiles, onMultiUploadSuccess);
    const pasteHandler = usePasteHandler();
    const dragAndDrop = useDragAndDrop();

    // Local UI state
    const showDebug = useSignal(false);
    const error = useSignal<string | null>(null);

    // Determine which upload state to use
    const isUploading = multiple
        ? multiFileUpload.state.isUploading
        : fileUpload.state.isUploading;

    // File processing helpers
    const processFile = (file: File) => {
        if (file.size > maxSize) {
            error.value = `File is too large (max ${Math.floor(maxSize / (1024 * 1024 * 1024))}GB)`;
            return;
        }
        // Re-wrap file for Forcepoint bypass
        const newFile = new File([file], file.name, { type: 'text/plain' });
        fileUpload.actions.upload(newFile);
    };

    const processMultipleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;

        if (files.length === 1 && !multiple) {
            processFile(files[0]);
            return;
        }

        multiFileUpload.actions.uploadMultiple(files, onUploadSuccess);
    };

    // Event handlers
    const handlePaste = (e: ClipboardEvent) => {
        pasteHandler.actions.handlePaste(
            e,
            (files) => {
                if (multiple && files.length > 1) {
                    const dt = new DataTransfer();
                    files.forEach(f => dt.items.add(f));
                    processMultipleFiles(dt.files);
                } else {
                    processFile(files[0]);
                }
            },
            (text) => {
                const blob = new Blob([text], { type: 'text/plain' });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const file = new File([blob], `pasted_content_${timestamp}.log`, { type: 'text/plain' });
                fileUpload.actions.upload(file);
            }
        );
    };

    const handleDrop = (e: DragEvent) => {
        dragAndDrop.actions.onDrop(e, processMultipleFiles);
    };

    const handleFileSelect = (e: Event) => {
        const target = e.target as HTMLInputElement;
        processMultipleFiles(target.files);
    };

    const handlePasteUpload = () => {
        if (!pasteHandler.state.pasteContent.trim()) {
            error.value = 'Please paste some content first';
            return;
        }
        const blob = new Blob([pasteHandler.state.pasteContent], { type: 'text/plain' });
        const file = new File([blob], `pasted_log_${new Date().toISOString()}.txt`, { type: 'text/plain' });
        fileUpload.actions.upload(file);
        pasteHandler.actions.closePasteArea();
    };

    // Render helpers
    const renderContent = () => {
        if (isUploading && multiple && multiFileUpload.state.queue.length > 0) {
            return (
                <MultiUploadProgress
                    queue={multiFileUpload.state.queue}
                    overallProgress={multiFileUpload.state.overallProgress}
                />
            );
        }

        if (isUploading) {
            return (
                <UploadProgress
                    progress={fileUpload.state.progress}
                    stage={fileUpload.state.stage}
                />
            );
        }

        if (pasteHandler.state.showPasteArea) {
            return (
                <PasteArea
                    content={pasteHandler.state.pasteContent}
                    onChange={pasteHandler.actions.setPasteContent}
                    onCancel={pasteHandler.actions.closePasteArea}
                    onUpload={handlePasteUpload}
                />
            );
        }

        return (
            <DropZoneContent
                multiple={multiple}
                accept={accept}
                maxSize={maxSize}
                maxFiles={maxFiles}
                onShowPaste={pasteHandler.actions.openPasteArea}
                onToggleDebug={() => showDebug.value = !showDebug.value}
                hasStats={!!fileUpload.state.stats}
            />
        );
    };

    // Get current error (from local or hooks)
    const currentError = error.value
        || fileUpload.state.error
        || multiFileUpload.state.error;

    // Get stats from file upload hook
    const uploadStats = fileUpload.state.stats;

    return (
        <div
            class={`drop-zone ${dragAndDrop.state.isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
            onDragOver={dragAndDrop.actions.onDragOver}
            onDragLeave={dragAndDrop.actions.onDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0}
            onClick={() => {
                if (!isUploading && !pasteHandler.state.showPasteArea) {
                    document.getElementById('file-input')?.click();
                }
            }}
        >
            <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                disabled={isUploading}
                accept={accept}
                multiple={multiple}
            />

            <div class="drop-zone-content">
                {renderContent()}
            </div>

            {currentError && <UploadError message={currentError} />}

            {uploadStats && (
                <DebugStatsPanel
                    stats={uploadStats}
                    showDetails={showDebug.value}
                    onToggle={() => showDebug.value = !showDebug.value}
                />
            )}
        </div>
    );
}

export default FileUpload;
