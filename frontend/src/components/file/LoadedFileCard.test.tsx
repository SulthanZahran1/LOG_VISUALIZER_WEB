import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { LoadedFileCard } from './LoadedFileCard';
import { currentSession, isStreaming, streamProgress, totalEntries } from '../../stores/logStore';

describe('LoadedFileCard', () => {
    afterEach(() => {
        currentSession.value = null;
        totalEntries.value = 0;
        isStreaming.value = false;
        streamProgress.value = 0;
    });

    it('renders the parse failure callout when the active session errors', () => {
        currentSession.value = {
            id: 'session-1',
            fileId: 'file-1',
            status: 'error',
            progress: 42,
            errors: [
                {
                    line: 12,
                    content: 'bad row',
                    reason: 'Unsupported timestamp format'
                }
            ]
        };

        render(
            <LoadedFileCard
                recentFiles={[
                    {
                        id: 'file-1',
                        name: 'broken.log',
                        size: 1024,
                        uploadedAt: '2026-03-04T00:00:00Z',
                        status: 'uploaded'
                    }
                ]}
                onUnload={vi.fn()}
            />
        );

        expect(screen.getByText('Parse failed')).toBeInTheDocument();
        expect(screen.getByText('Parsing stopped before the file was ready.')).toBeInTheDocument();
        expect(screen.getByText('Unsupported timestamp format')).toBeInTheDocument();
    });
});
