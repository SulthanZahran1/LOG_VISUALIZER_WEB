

interface UploadProgressProps {
    progress: number;
    stage: string;
}

export function UploadProgress({ progress, stage }: UploadProgressProps) {
    const isProcessing = progress >= 75;

    return (
        <>
            <div class={`upload-spinner ${isProcessing ? 'processing' : ''}`}></div>
            <p class="drop-text">{stage || 'Uploading...'}</p>
            <p class="drop-hint" style={{ marginTop: '8px', fontSize: '16px', fontWeight: 500 }}>
                {progress > 0 ? `${progress}%` : 'Starting...'}
            </p>
            {progress > 0 && (
                <div class="progress-bar-container">
                    <div
                        class={`progress-bar ${isProcessing ? 'processing' : ''}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    ></div>
                </div>
            )}
            {isProcessing && progress < 100 && (
                <p class="processing-hint">
                    {progress >= 85 && progress < 95
                        ? 'Server is assembling and processing your file...'
                        : progress >= 95
                        ? 'Finalizing...'
                        : 'Waiting for server acknowledgment...'}
                </p>
            )}
        </>
    );
}

export default UploadProgress;
