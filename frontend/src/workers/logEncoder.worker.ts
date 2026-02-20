/**
 * Web Worker for Log Encoding
 * 
 * Processes log files off the main thread to avoid UI blocking.
 * Implements streaming encoding for large files.
 */

import { parsePLCDebugLine, encodeLogEntries, calculateCompressionRatio } from '../api/logEncoder';

interface WorkerMessage {
    type: 'encode' | 'ping';
    id: string;
    payload?: {
        chunk: string;
        chunkIndex: number;
        totalChunks: number;
        isLast: boolean;
    };
}

interface WorkerResponse {
    type: 'progress' | 'chunk' | 'complete' | 'error' | 'pong';
    id: string;
    payload?: {
        chunkIndex?: number;
        encodedData?: Uint8Array;
        progress?: number;
        originalSize?: number;
        encodedSize?: number;
        compressionRatio?: string;
        error?: string;
    };
}

// State for streaming encoding
let accumulatedLines: string[] = [];
let totalOriginalBytes = 0;
let totalEncodedBytes = 0;
let currentChunkIndex = 0;

/**
 * Encode a batch of log lines
 */
function encodeBatch(lines: string[]): Uint8Array {
    const entries = [];

    for (const line of lines) {
        const entry = parsePLCDebugLine(line);
        if (entry) {
            entries.push(entry);
        }
    }

    if (entries.length === 0) {
        return new Uint8Array(0);
    }

    return encodeLogEntries(entries);
}

/**
 * Handle encode message
 */
function handleEncode(message: WorkerMessage): void {
    if (!message.payload) return;

    const { chunk, chunkIndex, totalChunks, isLast } = message.payload;

    // Accumulate lines from chunk
    const lines = chunk.split('\n');
    accumulatedLines.push(...lines);
    totalOriginalBytes += new TextEncoder().encode(chunk).length;

    // Process in batches of 5000 lines to avoid memory issues
    const BATCH_SIZE = 5000;

    while (accumulatedLines.length >= BATCH_SIZE || (isLast && accumulatedLines.length > 0)) {
        const batchSize = Math.min(BATCH_SIZE, accumulatedLines.length);
        const batch = accumulatedLines.splice(0, batchSize);

        const encoded = encodeBatch(batch);
        totalEncodedBytes += encoded.length;

        // Send encoded chunk back to main thread
        const response: WorkerResponse = {
            type: 'chunk',
            id: message.id,
            payload: {
                chunkIndex: currentChunkIndex++,
                encodedData: encoded,
                originalSize: totalOriginalBytes,
                encodedSize: totalEncodedBytes,
            }
        };

        self.postMessage(response, { transfer: [encoded.buffer as ArrayBuffer] });

        // Send progress update
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        const progressResponse: WorkerResponse = {
            type: 'progress',
            id: message.id,
            payload: { progress }
        };
        self.postMessage(progressResponse);
    }

    // If this is the last chunk, send completion
    if (isLast) {
        const completionResponse: WorkerResponse = {
            type: 'complete',
            id: message.id,
            payload: {
                originalSize: totalOriginalBytes,
                encodedSize: totalEncodedBytes,
                compressionRatio: calculateCompressionRatio(totalOriginalBytes, totalEncodedBytes),
            }
        };
        self.postMessage(completionResponse);

        // Reset state
        accumulatedLines = [];
        totalOriginalBytes = 0;
        totalEncodedBytes = 0;
        currentChunkIndex = 0;
    }
}

/**
 * Main message handler
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    try {
        switch (message.type) {
            case 'ping':
                const pongResponse: WorkerResponse = {
                    type: 'pong',
                    id: message.id
                };
                self.postMessage(pongResponse);
                break;

            case 'encode':
                handleEncode(message);
                break;

            default:
                const errorResponse: WorkerResponse = {
                    type: 'error',
                    id: message.id,
                    payload: { error: `Unknown message type: ${(message as WorkerMessage).type}` }
                };
                self.postMessage(errorResponse);
        }
    } catch (error) {
        const errorResponse: WorkerResponse = {
            type: 'error',
            id: message.id,
            payload: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
        self.postMessage(errorResponse);
    }
};

// Export empty to make this a module
export {};
