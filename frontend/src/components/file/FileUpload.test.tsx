import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import { FileUpload } from './FileUpload';

vi.mock('../../api/client', () => ({
    uploadFile: vi.fn(async (file: File) => ({
        id: file.name,
        name: file.name,
        size: file.size,
        uploadedAt: '2026-03-27T00:00:00Z',
        status: 'uploaded' as const
    })),
    uploadFileWebSocket: vi.fn(async (file: File) => ({
        id: file.name,
        name: file.name,
        size: file.size,
        uploadedAt: '2026-03-27T00:00:00Z',
        status: 'uploaded' as const
    }))
}));

describe('FileUpload Paste Support', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('handles pasted files from clipboard', async () => {
        const onUploadSuccess = vi.fn();
        const { container } = render(
            <FileUpload onUploadSuccess={onUploadSuccess} />
        );

        const dropZone = container.querySelector('.drop-zone')!;

        // Mock a file
        const file = new File(['log content'], 'test.log', { type: 'text/plain' });

        // Simulate paste event
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                items: [
                    {
                        kind: 'file',
                        getAsFile: () => file
                    }
                ],
                getData: () => ''
            }
        });

        fireEvent(dropZone, pasteEvent);

        // Success is hard to track directly because of the async uploadFn, 
        // but we can check if it prevents default
        expect(pasteEvent.defaultPrevented).toBe(true);
    });

    it('handles pasted text from clipboard', async () => {
        const onUploadSuccess = vi.fn();
        const { container } = render(
            <FileUpload onUploadSuccess={onUploadSuccess} />
        );

        const dropZone = container.querySelector('.drop-zone')!;

        // Simulate paste event with text
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                items: [],
                getData: (type: string) => type === 'text' ? 'some pasted log content' : ''
            }
        });

        fireEvent(dropZone, pasteEvent);

        expect(pasteEvent.defaultPrevented).toBe(true);
    });

    it('allows multi-file uploads larger than ten files when no maxFiles cap is provided', async () => {
        const onUploadSuccess = vi.fn();
        const onMultiUploadSuccess = vi.fn();
        const { container, queryByText } = render(
            <FileUpload
                onUploadSuccess={onUploadSuccess}
                onMultiUploadSuccess={onMultiUploadSuccess}
                multiple
            />
        );

        expect(queryByText(/max 10 files/i)).not.toBeInTheDocument();

        const input = container.querySelector('#file-input') as HTMLInputElement;
        const files = Array.from({ length: 11 }, (_, index) => (
            new File([`log ${index}`], `test-${index}.log`, { type: 'text/plain' })
        ));

        Object.defineProperty(input, 'files', {
            configurable: true,
            value: files
        });

        fireEvent.change(input);

        await waitFor(() => {
            expect(onMultiUploadSuccess).toHaveBeenCalledTimes(1);
        });

        const uploadedFiles = onMultiUploadSuccess.mock.calls[0][0];
        expect(uploadedFiles).toHaveLength(11);
        expect(onUploadSuccess).toHaveBeenCalledTimes(11);
    });
});
