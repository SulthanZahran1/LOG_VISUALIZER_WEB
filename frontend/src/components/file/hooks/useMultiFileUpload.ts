/* global FileList */
import { useSignal } from '@preact/signals';
import { uploadFile, uploadFileWebSocket } from '../../../api/client';
import type { FileInfo } from '../../../models/types';

export interface UploadQueueItem {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
    progress: number;
    error?: string;
    result?: FileInfo;
}

export interface MultiFileUploadState {
    isUploading: boolean;
    queue: UploadQueueItem[];
    overallProgress: number;
    error: string | null;
}

export interface MultiFileUploadActions {
    uploadMultiple: (files: FileList | File[], onFileSuccess?: (file: FileInfo) => void) => Promise<FileInfo[]>;
    reset: () => void;
}

const CHUNK_THRESHOLD = 5 * 1024 * 1024; // 5MB

function createQueueItem(file: File, index: number): UploadQueueItem {
    return {
        id: `upload-${Date.now()}-${index}`,
        file: new File([file], file.name, { type: 'text/plain' }),
        status: 'pending',
        progress: 0
    };
}

/**
 * Hook for multi-file upload with queue management
 */
export function useMultiFileUpload(
    maxFiles: number = 10,
    onAllComplete?: (files: FileInfo[]) => void
): {
    state: MultiFileUploadState;
    actions: MultiFileUploadActions;
} {
    const isUploading = useSignal(false);
    const queue = useSignal<UploadQueueItem[]>([]);
    const overallProgress = useSignal(0);
    const error = useSignal<string | null>(null);

    const reset = () => {
        queue.value = [];
        isUploading.value = false;
        overallProgress.value = 0;
        error.value = null;
    };

    const uploadMultiple = async (
        files: FileList | File[],
        onFileSuccess?: (file: FileInfo) => void
    ): Promise<FileInfo[]> => {
        const fileArray = Array.from(files);

        if (fileArray.length > maxFiles) {
            error.value = `Too many files. Maximum ${maxFiles} files allowed.`;
            return [];
        }

        const newQueue = fileArray.map(createQueueItem);
        queue.value = newQueue;
        isUploading.value = true;
        error.value = null;
        overallProgress.value = 0;

        const uploadedFiles: FileInfo[] = [];
        const totalFiles = newQueue.length;

        for (let i = 0; i < newQueue.length; i++) {
            const item = newQueue[i];
            item.status = 'uploading';
            queue.value = [...newQueue];

            try {
                let info: FileInfo;

                if (item.file.size > CHUNK_THRESHOLD) {
                    info = await uploadFileWebSocket(item.file, (p) => {
                        item.progress = p;
                        queue.value = [...newQueue];

                        const completedProgress = uploadedFiles.length * 100;
                        overallProgress.value = Math.floor((completedProgress + p) / totalFiles);
                    });
                } else {
                    info = await uploadFile(item.file);
                    item.progress = 100;
                }

                item.status = 'complete';
                item.result = info;
                uploadedFiles.push(info);
                queue.value = [...newQueue];

                onFileSuccess?.(info);
            } catch (err) {
                item.status = 'error';
                item.error = err instanceof Error ? err.message : 'Upload failed';
                queue.value = [...newQueue];
            }
        }

        isUploading.value = false;

        if (uploadedFiles.length > 0) {
            onAllComplete?.(uploadedFiles);
        }

        // Clear queue after delay if all successful
        const allSuccess = newQueue.every(item => item.status === 'complete');
        if (allSuccess) {
            setTimeout(() => {
                queue.value = [];
                overallProgress.value = 0;
            }, 2000);
        }

        return uploadedFiles;
    };

    return {
        state: {
            isUploading: isUploading.value,
            queue: queue.value,
            overallProgress: overallProgress.value,
            error: error.value
        },
        actions: { uploadMultiple, reset }
    };
}

export default useMultiFileUpload;
