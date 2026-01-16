import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { FileUpload } from './FileUpload';

describe('FileUpload Paste Support', () => {
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
});
