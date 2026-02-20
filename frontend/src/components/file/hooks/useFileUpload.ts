/* global performance */
import { useSignal } from '@preact/signals';
import { uploadFile, uploadFileWebSocket, uploadFileOptimized } from '../../../api/client';
import type { FileInfo } from '../../../models/types';

export interface UploadStats {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    uploadTime: number;
    algorithm: string;
    memoryPeak: number;
}

export interface FileUploadState {
    isUploading: boolean;
    progress: number;
    stage: string;
    error: string | null;
    stats: UploadStats | null;
}

export interface FileUploadActions {
    upload: (file: File) => Promise<FileInfo | null>;
    reset: () => void;
}

const CHUNK_THRESHOLD = 5 * 1024 * 1024; // 5MB

/**
 * Hook for single file upload with WebSocket/HTTP fallback
 */
export function useFileUpload(
    onSuccess?: (file: FileInfo) => void,
    uploadFn: (file: File) => Promise<FileInfo> = uploadFile
): {
    state: FileUploadState;
    actions: FileUploadActions;
} {
    const isUploading = useSignal(false);
    const progress = useSignal(0);
    const stage = useSignal<string>('');
    const error = useSignal<string | null>(null);
    const stats = useSignal<UploadStats | null>(null);

    const reset = () => {
        isUploading.value = false;
        progress.value = 0;
        stage.value = '';
        error.value = null;
        stats.value = null;
    };

    const upload = async (file: File): Promise<FileInfo | null> => {
        isUploading.value = true;
        progress.value = 0;
        stage.value = 'Preparing...';
        error.value = null;
        stats.value = null;

        const startTime = performance.now();
        const memoryBefore = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

        try {
            let info: FileInfo;

            if (file.size > CHUNK_THRESHOLD) {
                try {
                    info = await uploadFileWebSocket(file, (p, s) => {
                        progress.value = p;
                        if (s) {
                            const match = s.match(/^(.*)\s*\((\d+[ms\s]+)\)$/);
                            stage.value = match ? match[1].trim() : s;
                        }
                    });
                } catch (wsErr) {
                    console.warn('WebSocket failed, falling back to HTTP:', wsErr);
                    progress.value = 0;
                    stage.value = 'Retrying with HTTP...';
                    info = await uploadFileOptimized(file, (p, s) => {
                        progress.value = p;
                        if (s) stage.value = s;
                    });
                }
            } else {
                stage.value = 'Uploading...';
                info = await uploadFn(file);
            }

            const endTime = performance.now();
            const memoryAfter = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

            const originalSize = file.size;
            const compressedSize = info.size || originalSize;
            const compressionRatio = originalSize > 0
                ? ((1 - compressedSize / originalSize) * 100)
                : 0;

            stats.value = {
                originalSize,
                compressedSize,
                compressionRatio,
                uploadTime: endTime - startTime,
                algorithm: 'gzip',
                memoryPeak: Math.max(memoryBefore, memoryAfter)
            };

            onSuccess?.(info);
            return info;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Upload failed';
            return null;
        } finally {
            isUploading.value = false;
            progress.value = 0;
        }
    };

    return {
        state: {
            isUploading: isUploading.value,
            progress: progress.value,
            stage: stage.value,
            error: error.value,
            stats: stats.value
        },
        actions: { upload, reset }
    };
}

export default useFileUpload;
