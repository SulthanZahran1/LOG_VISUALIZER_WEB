/* global FileList */
import { useSignal } from '@preact/signals';

export interface DragAndDropState {
    isDragging: boolean;
}

export interface DragAndDropActions {
    onDragOver: (e: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent, onFiles: (files: FileList) => void) => void;
}

/**
 * Hook for drag and drop file handling
 */
export function useDragAndDrop(): {
    state: DragAndDropState;
    actions: DragAndDropActions;
} {
    const isDragging = useSignal(false);

    const onDragOver = (e: DragEvent): void => {
        e.preventDefault();
        isDragging.value = true;
    };

    const onDragLeave = (): void => {
        isDragging.value = false;
    };

    const onDrop = (e: DragEvent, onFiles: (files: FileList) => void): void => {
        e.preventDefault();
        isDragging.value = false;

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            onFiles(files);
        }
    };

    return {
        state: {
            isDragging: isDragging.value
        },
        actions: {
            onDragOver,
            onDragLeave,
            onDrop
        }
    };
}

export default useDragAndDrop;
