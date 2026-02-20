/* global ClipboardEvent */
import { useSignal } from '@preact/signals';

export interface PasteHandlerState {
    showPasteArea: boolean;
    pasteContent: string;
}

export interface PasteHandlerActions {
    handlePaste: (e: ClipboardEvent, onFiles: (files: File[]) => void, onText: (text: string) => void) => void;
    setPasteContent: (content: string) => void;
    openPasteArea: () => void;
    closePasteArea: () => void;
}

/**
 * Hook for handling clipboard paste (files and text)
 */
export function usePasteHandler(): {
    state: PasteHandlerState;
    actions: PasteHandlerActions;
} {
    const showPasteArea = useSignal(false);
    const pasteContent = useSignal('');

    const handlePaste = (
        e: ClipboardEvent,
        onFiles: (files: File[]) => void,
        onText: (text: string) => void
    ): void => {
        // If paste area is open, let the textarea handle it
        if (showPasteArea.value) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        const files: File[] = [];

        // Check for files in clipboard
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            onFiles(files);
            return;
        }

        // Check for text in clipboard
        const text = e.clipboardData?.getData('text');
        if (text && text.length > 0) {
            e.preventDefault();
            onText(text);
        }
    };

    const setPasteContent = (content: string) => {
        pasteContent.value = content;
    };

    const openPasteArea = () => {
        showPasteArea.value = true;
        pasteContent.value = '';
    };

    const closePasteArea = () => {
        showPasteArea.value = false;
        pasteContent.value = '';
    };

    return {
        state: {
            showPasteArea: showPasteArea.value,
            pasteContent: pasteContent.value
        },
        actions: {
            handlePaste,
            setPasteContent,
            openPasteArea,
            closePasteArea
        }
    };
}

export default usePasteHandler;
