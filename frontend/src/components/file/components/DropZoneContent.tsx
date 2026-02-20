interface DropZoneContentProps {
    multiple: boolean;
    accept?: string;
    maxSize?: number;
    maxFiles?: number;
    onShowPaste: () => void;
    onToggleDebug: () => void;
    hasStats: boolean;
}

function formatMaxSize(bytes: number): string {
    return Math.floor(bytes / (1024 * 1024 * 1024)) + 'GB';
}

export function DropZoneContent({
    multiple,
    accept,
    maxSize,
    maxFiles,
    onShowPaste,
    onToggleDebug,
    hasStats
}: DropZoneContentProps) {
    return (
        <>
            <div class="drop-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
            </div>
            <p class="drop-text">
                {multiple
                    ? 'Drag & drop multiple files here'
                    : 'Drag & drop or Paste content here'
                }
            </p>
            <p class="drop-hint">or click to browse</p>
            <div class="drop-formats">
                {accept ? `Supports ${accept.split(',').join(', ')}` : 'Supports .log, .txt, .csv files'}
                {maxSize ? ` · up to ${formatMaxSize(maxSize)}` : ''}
                {multiple && maxFiles ? ` · max ${maxFiles} files` : ''}
            </div>
            {!multiple && (
                <div class="paste-option" onClick={(e) => {
                    e.stopPropagation();
                    onShowPaste();
                }}>
                    or paste text content
                </div>
            )}
            <div class="paste-option" style={{ marginTop: '8px', opacity: 0.6 }} onClick={(e) => {
                e.stopPropagation();
                onToggleDebug();
            }}>
                {hasStats ? '📊 Show/Hide Debug Stats' : '📊 Debug Stats (after upload)'}
            </div>
        </>
    );
}

export default DropZoneContent;
