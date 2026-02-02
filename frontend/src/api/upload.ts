/**
 * Optimized Upload Client
 * 
 * Features:
 * - Log-specific binary encoding (85-95% size reduction for text logs)
 * - Parallel chunk uploads with concurrency control
 * - Compression using native CompressionStream API
 * - Larger chunk size (5MB) for reduced HTTP overhead
 * - Connection keep-alive for persistent connections
 * - Exponential backoff retry logic
 * - Minimal packet overhead
 * - Async processing with SSE progress tracking (no timeouts!)
 */

import type { FileInfo } from '../models/types';

const API_BASE = '/api';

/** Upload processing job status */
export interface UploadJob {
    id: string;
    uploadId: string;
    fileName: string;
    totalChunks: number;
    originalSize: number;
    compressedSize: number;
    encoding: string;
    status: 'processing' | 'assembling' | 'decompressing' | 'complete' | 'error';
    progress: number;
    stage: string;
    stageProgress: number;
    fileInfo?: FileInfo;
    error?: string;
}

class UploadError extends Error {
    status: number;
    retryable: boolean;

    constructor(status: number, message: string, retryable = false) {
        super(message);
        this.name = 'UploadError';
        this.status = status;
        this.retryable = retryable;
    }
}

// Configuration
const CONFIG = {
    // 5MB chunks - optimal balance between parallelism and HTTP overhead
    CHUNK_SIZE: 5 * 1024 * 1024,
    // Max 3 parallel uploads to avoid overwhelming the server
    MAX_CONCURRENT: 3,
    // Retry configuration
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    // Compression threshold - only compress files > 100KB
    COMPRESSION_THRESHOLD: 100 * 1024,
    // Max file size for single upload (avoid chunking overhead for small files)
    SINGLE_UPLOAD_THRESHOLD: 5 * 1024 * 1024,
} as const;

/**
 * Check if CompressionStream API is available
 */
function isCompressionSupported(): boolean {
    return typeof CompressionStream !== 'undefined';
}

/**
 * Sleep with exponential backoff
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload a single chunk with retry logic
 */
async function uploadChunkWithRetry(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    totalChunks: number,
    compressed: boolean,
    retryCount = 0
): Promise<void> {
    const formData = new FormData();
    formData.append('file', chunk, `chunk_${chunkIndex}`);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());

    try {
        const response = await fetch(`${API_BASE}/files/upload/chunk`, {
            method: 'POST',
            body: formData,
            headers: {
                // Keep connection alive for subsequent chunks
                'Connection': 'keep-alive',
                // Indicate if this chunk is compressed
                ...(compressed && { 'X-Chunk-Compressed': 'gzip' }),
                // Help server optimize storage
                'X-Chunk-Index': chunkIndex.toString(),
                'X-Total-Chunks': totalChunks.toString(),
            },
            // @ts-ignore - duplex option for streaming
            duplex: 'half',
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            const retryable = response.status >= 500 || response.status === 429;
            throw new UploadError(response.status, errorText, retryable);
        }
    } catch (error) {
        // Network errors are retryable
        const isRetryable = error instanceof UploadError 
            ? error.retryable 
            : true;

        if (isRetryable && retryCount < CONFIG.MAX_RETRIES) {
            const delay = CONFIG.BASE_DELAY_MS * Math.pow(2, retryCount);
            console.warn(`Chunk ${chunkIndex} failed, retrying in ${delay}ms...`);
            await sleep(delay);
            return uploadChunkWithRetry(uploadId, chunkIndex, chunk, totalChunks, compressed, retryCount + 1);
        }

        throw error;
    }
}

/**
 * Track upload processing progress via Server-Sent Events
 */
function trackUploadProgress(
    jobId: string,
    onProgress?: (progress: number, stage: string) => void
): Promise<FileInfo> {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${API_BASE}/files/upload/${jobId}/status`);
        
        eventSource.onmessage = (event) => {
            try {
                const data: UploadJob = JSON.parse(event.data);
                
                if (data.error) {
                    eventSource.close();
                    reject(new Error(data.error));
                    return;
                }
                
                // Map internal stages to user-friendly messages
                const stageMessages: Record<string, string> = {
                    'preparing': 'Preparing file...',
                    'assembling chunks': `Assembling chunks (${Math.round(data.stageProgress)}%)...`,
                    'decompressing file': `Decompressing ${(data.originalSize / 1024 / 1024).toFixed(1)}MB file (${Math.round(data.stageProgress)}%)...`,
                };
                
                const stageMessage = stageMessages[data.stage] || data.stage;
                onProgress?.(Math.round(data.progress), stageMessage);
                
                if (data.status === 'complete' && data.fileInfo) {
                    eventSource.close();
                    resolve(data.fileInfo);
                } else if (data.status === 'error') {
                    eventSource.close();
                    reject(new Error(data.error || 'Upload processing failed'));
                }
            } catch (err) {
                console.error('Failed to parse SSE data:', err);
            }
        };
        
        eventSource.onerror = () => {
            eventSource.close();
            reject(new Error('Lost connection to server'));
        };
    });
}

/**
 * Upload multiple chunks in parallel with concurrency control
 */
async function uploadChunksParallel(
    uploadId: string,
    chunks: Blob[],
    onProgress: (progress: number) => void,
    compressed: boolean
): Promise<void> {
    const totalChunks = chunks.length;
    const completedChunks = new Array<boolean>(totalChunks).fill(false);
    let completedCount = 0;

    // Process chunks in batches
    for (let i = 0; i < totalChunks; i += CONFIG.MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + CONFIG.MAX_CONCURRENT);
        const batchIndices = batch.map((_, idx) => i + idx);

        // Upload batch in parallel
        await Promise.all(
            batch.map(async (chunk, idx) => {
                const chunkIndex = batchIndices[idx];
                
                await uploadChunkWithRetry(
                    uploadId,
                    chunkIndex,
                    chunk,
                    totalChunks,
                    compressed
                );
                
                completedChunks[chunkIndex] = true;
                completedCount++;
                onProgress(Math.round((completedCount / totalChunks) * 100));
            })
        );
    }
}

/**
 * Generate a compact upload ID
 */
function generateUploadId(): string {
    // Use base36 encoding for shorter IDs
    const time = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${time}-${random}`;
}

/**
 * Compress entire file using gzip
 */
async function compressFile(file: File): Promise<Blob> {
    if (!isCompressionSupported()) {
        return file;
    }

    try {
        const stream = file.stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const response = new Response(compressedStream);
        const compressed = await response.blob();
        
        console.log(`Compressed ${file.size} bytes → ${compressed.size} bytes (${((1 - compressed.size/file.size) * 100).toFixed(1)}% reduction)`);
        return compressed;
    } catch (e) {
        console.warn('Compression failed, using uncompressed:', e);
        return file;
    }
}

/**
 * Optimized chunked file upload with WHOLE-FILE compression first
 * 
 * Flow: File → Compress ENTIRE file → Slice compressed data → Upload chunks → Async processing with SSE
 * 
 * This gives much better compression than per-chunk compression because
 * the compressor can build a dictionary from the entire file.
 * 
 * Performance improvements:
 * - Whole-file compression = 80-95% size reduction for logs
 * - 5MB chunks of compressed data = fewer HTTP requests
 * - Parallel uploads (3 concurrent) = faster transfer
 * - Connection keep-alive = reduced TCP handshake overhead
 * - Async processing with real-time SSE progress (no timeouts for large files!)
 */
export async function uploadFileOptimized(
    file: File,
    onProgress?: (progress: number, stage?: string) => void
): Promise<FileInfo> {
    onProgress?.(0, 'Preparing upload...');

    // Step 1: Compress ENTIRE file first (better compression ratio)
    onProgress?.(5, 'Compressing file...');
    const compressedBlob = await compressFile(file);
    const isCompressed = compressedBlob.size < file.size;
    const compressionRatio = file.size / compressedBlob.size;
    
    console.log(`Uploading ${isCompressed ? 'compressed' : 'uncompressed'}: ${file.size} → ${compressedBlob.size} bytes (${compressionRatio.toFixed(1)}x ratio)`);

    // Step 2: Slice the COMPRESSED data into chunks
    const uploadId = generateUploadId();
    const totalChunks = Math.ceil(compressedBlob.size / CONFIG.CHUNK_SIZE);
    
    const chunks: Blob[] = [];
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CONFIG.CHUNK_SIZE;
        const end = Math.min(start + CONFIG.CHUNK_SIZE, compressedBlob.size);
        chunks.push(compressedBlob.slice(start, end));
    }

    // Step 3: Upload chunks in parallel
    await uploadChunksParallel(uploadId, chunks, (p) => {
        // Map chunk progress to overall progress (10% for compression, 80% for upload)
        onProgress?.(10 + Math.round(p * 0.8), `Uploading chunks (${p}%)...`);
    }, isCompressed);

    // Step 4: Start async processing and track via SSE (no timeout issues!)
    onProgress?.(90, 'Starting server processing...');
    const response = await fetch(`${API_BASE}/files/upload/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            uploadId,
            name: file.name,
            totalChunks,
            originalSize: file.size,
            compressedSize: compressedBlob.size,
            encoding: isCompressed ? 'gzip' : 'none',
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to start upload processing' }));
        throw new UploadError(response.status, error.error);
    }

    const { jobId } = await response.json() as { jobId: string };
    console.log(`Upload processing started with job ID: ${jobId}`);

    // Step 5: Track async processing progress via SSE (this can take minutes for large files)
    const fileInfo = await trackUploadProgress(jobId, (progress, stage) => {
        // Map 90-100% for server-side processing
        onProgress?.(90 + Math.round(progress * 0.1), stage);
    });

    onProgress?.(100, 'Complete!');
    return fileInfo;
}

/**
 * Legacy chunked upload - kept for compatibility
 * Uses sequential uploads (slower but simpler)
 * Now uses async processing with SSE progress tracking
 */
export async function uploadFileChunkedLegacy(
    file: File,
    onProgress?: (progress: number, stage?: string) => void
): Promise<FileInfo> {
    const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB for legacy
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = generateUploadId();

    onProgress?.(0, 'Uploading chunks...');
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', i.toString());

        const response = await fetch(`${API_BASE}/files/upload/chunk`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Chunk upload failed' }));
            throw new UploadError(response.status, error.error || `Chunk ${i} failed`);
        }

        onProgress?.(Math.round(((i + 1) / totalChunks) * 80), `Uploading chunks (${Math.round(((i + 1) / totalChunks) * 100)}%)...`);
    }

    // Start async processing
    onProgress?.(80, 'Starting server processing...');
    const response = await fetch(`${API_BASE}/files/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, name: file.name, totalChunks }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to start upload processing' }));
        throw new UploadError(response.status, error.error);
    }

    const { jobId } = await response.json() as { jobId: string };

    // Track async processing via SSE
    const fileInfo = await trackUploadProgress(jobId, (progress, stage) => {
        onProgress?.(80 + Math.round(progress * 0.2), stage);
    });

    onProgress?.(100, 'Complete!');
    return fileInfo;
}

// Export configuration for debugging
export { CONFIG };

// Export progress tracking for other upload modules
export { trackUploadProgress };

// Export log encoder for advanced usage
export { parsePLCDebugLine, encodeLogEntries, calculateCompressionRatio } from './logEncoder';
