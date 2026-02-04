/**
 * WebSocket Upload Client
 * 
 * Provides file upload functionality over WebSocket for better performance:
 * - Single persistent connection for all chunks
 * - Lower overhead than HTTP requests
 * - Real-time bidirectional progress updates
 * - Automatic reconnection support
 * 
 * Supports:
 * - Large file chunked uploads with gzip compression
 * - Map XML uploads
 * - Rules YAML uploads
 * - Carrier log uploads
 */

import type { FileInfo } from '../models/types';
import { blobToBase64 } from '../utils/base64';

// WebSocket URL - goes through Vite proxy to backend
// Vite dev server proxies /api to http://localhost:8089
// In production, nginx handles the proxy
const WS_BASE = (() => {
    // Use same host:port as the page (works with Vite proxy)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws/uploads`;
})();

// Message types
const MsgTypeUploadInit = 'upload:init';
const MsgTypeUploadChunk = 'upload:chunk';
const MsgTypeUploadComplete = 'upload:complete';
const MsgTypeMapUpload = 'map:upload';
const MsgTypeRulesUpload = 'rules:upload';
const MsgTypeCarrierUpload = 'carrier:upload';
const MsgTypeAck = 'ack';
const MsgTypeComplete = 'complete';
const MsgTypeError = 'error';

// Configuration
const CONFIG = {
    CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks
    RECONNECT_ATTEMPTS: 3,
    RECONNECT_DELAY_MS: 1000,
    CONNECTION_TIMEOUT_MS: 10000,
} as const;

// WebSocket message interface
interface WSMessage {
    type: string;
    id?: string;
    payload?: unknown;
    timestamp: number;
}

interface UploadInitPayload {
    fileName: string;
    totalChunks: number;
    totalSize: number;
    encoding: string;
}

interface UploadChunkPayload {
    uploadId: string;
    chunkIndex: number;
    data: string;
    isLast?: boolean;
}

interface UploadCompletePayload {
    uploadId: string;
    fileName: string;
    totalChunks: number;
    originalSize: number;
    compressedSize: number;
    encoding: string;
}

interface FileUploadPayload {
    name: string;
    data: string;
}

interface WSCompleteResponse {
    type: string;
    uploadId?: string;
    fileInfo?: FileInfo;
    result?: unknown;
}

interface WSErrorResponse {
    type: string;
    message: string;
    code?: string;
}

class WebSocketUploadClient {
    private ws: WebSocket | null = null;
    private messageHandlers: Map<string, ((msg: WSMessage) => void)[]> = new Map();
    private pendingMessages: WSMessage[] = [];
    private isConnected = false;
    private connectPromise: Promise<void> | null = null;

    /**
     * Connect to WebSocket server
     */
    connect(): Promise<void> {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, CONFIG.CONNECTION_TIMEOUT_MS);

            this.ws = new WebSocket(WS_BASE);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connected');
                this.isConnected = true;
                clearTimeout(timeout);
                
                // Send any pending messages
                while (this.pendingMessages.length > 0) {
                    const msg = this.pendingMessages.shift();
                    if (msg) this.send(msg);
                }
                
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg: WSMessage = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (err) {
                    console.error('[WebSocket] Failed to parse message:', err);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocket] Connection error:', error);
                console.log('[WebSocket] Attempted URL:', WS_BASE);
                clearTimeout(timeout);
                reject(new Error('WebSocket connection failed - check if server is running with WebSocket support'));
            };

            this.ws.onclose = () => {
                console.log('[WebSocket] Disconnected');
                this.isConnected = false;
                this.connectPromise = null;
            };
        });

        return this.connectPromise;
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    /**
     * Send a message over WebSocket
     */
    private send(msg: WSMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        } else {
            this.pendingMessages.push(msg);
        }
    }

    /**
     * Register a handler for a message type
     */
    on(type: string, handler: (msg: WSMessage) => void): () => void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type)!.push(handler);

        // Return unsubscribe function
        return () => {
            const handlers = this.messageHandlers.get(type);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) handlers.splice(index, 1);
            }
        };
    }

    /**
     * Handle incoming message
     */
    private handleMessage(msg: WSMessage): void {
        const handlers = this.messageHandlers.get(msg.type);
        if (handlers) {
            handlers.forEach(h => h(msg));
        }
    }

    /**
     * Wait for a specific message type
     */
    private waitForMessage(type: string, timeoutMs = 30000): Promise<WSMessage> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                unsubscribe();
                reject(new Error(`Timeout waiting for ${type}`));
            }, timeoutMs);

            const unsubscribe = this.on(type, (msg) => {
                clearTimeout(timeout);
                unsubscribe();
                resolve(msg);
            });
        });
    }

    /**
     * Upload a file with chunking over WebSocket
     */
    async uploadFile(
        file: File,
        onProgress?: (progress: number, stage?: string) => void
    ): Promise<FileInfo> {
        await this.connect();

        onProgress?.(0, 'Preparing...');

        // Compress file if beneficial
        const compressedBlob = await this.compressFile(file);
        const isCompressed = compressedBlob.size < file.size;
        const totalChunks = Math.ceil(compressedBlob.size / CONFIG.CHUNK_SIZE);

        console.log(`[WebSocket] Uploading: ${file.size} → ${compressedBlob.size} bytes, ${totalChunks} chunks`);

        // 1. Initialize upload
        const initPayload: UploadInitPayload = {
            fileName: file.name,
            totalChunks,
            totalSize: file.size,
            encoding: isCompressed ? 'gzip' : 'none',
        };

        this.send({
            type: MsgTypeUploadInit,
            payload: initPayload as unknown as Record<string, unknown>,
            timestamp: Date.now(),
        });

        // Wait for acknowledgment with upload ID
        const ackMsg = await this.waitForMessage(MsgTypeAck, 10000);
        const uploadId = ackMsg.id!;

        onProgress?.(5, 'Uploading chunks...');

        // 2. Upload chunks
        const chunks: Blob[] = [];
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CONFIG.CHUNK_SIZE;
            const end = Math.min(start + CONFIG.CHUNK_SIZE, compressedBlob.size);
            chunks.push(compressedBlob.slice(start, end));
        }

        // Upload chunks sequentially over the same connection
        for (let i = 0; i < totalChunks; i++) {
            const chunk = chunks[i];
            const base64Data = await blobToBase64(chunk);

            const chunkPayload: UploadChunkPayload = {
                uploadId,
                chunkIndex: i,
                data: base64Data,
                isLast: i === totalChunks - 1,
            };

            this.send({
                type: MsgTypeUploadChunk,
                payload: chunkPayload as unknown as Record<string, unknown>,
                timestamp: Date.now(),
            });

            const progress = Math.round((i + 1) / totalChunks * 80) + 5;
            onProgress?.(progress, `Uploading chunk ${i + 1}/${totalChunks}...`);
        }

        onProgress?.(90, 'Processing...');

        // 3. Complete upload
        const completePayload: UploadCompletePayload = {
            uploadId,
            fileName: file.name,
            totalChunks,
            originalSize: file.size,
            compressedSize: compressedBlob.size,
            encoding: isCompressed ? 'gzip' : 'none',
        };

        this.send({
            type: MsgTypeUploadComplete,
            payload: completePayload as unknown as Record<string, unknown>,
            timestamp: Date.now(),
        });

        // Wait for completion or error
        const result = await Promise.race([
            this.waitForMessage(MsgTypeComplete, 120000),
            this.waitForMessage(MsgTypeError, 120000).then(msg => {
                const error = msg.payload as WSErrorResponse;
                throw new Error(error.message);
            }),
        ]);

        onProgress?.(100, 'Complete!');

        const response = result.payload as WSCompleteResponse;
        return response.fileInfo!;
    }

    /**
     * Upload map XML file over WebSocket
     */
    async uploadMap(file: File): Promise<FileInfo> {
        await this.connect();

        const base64Data = await blobToBase64(file);
        const payload: FileUploadPayload = {
            name: file.name,
            data: base64Data,
        };

        this.send({
            type: MsgTypeMapUpload,
            payload: payload as unknown as Record<string, unknown>,
            timestamp: Date.now(),
        });

        const result = await Promise.race([
            this.waitForMessage(MsgTypeComplete, 30000),
            this.waitForMessage(MsgTypeError, 30000).then(msg => {
                const error = msg.payload as WSErrorResponse;
                throw new Error(error.message);
            }),
        ]);

        const response = result.payload as WSCompleteResponse;
        return response.fileInfo!;
    }

    /**
     * Upload rules YAML file over WebSocket
     */
    async uploadRules(file: File): Promise<{
        id: string;
        name: string;
        uploadedAt: string;
        rulesCount: number;
        deviceCount: number;
    }> {
        await this.connect();

        const base64Data = await blobToBase64(file);
        const payload: FileUploadPayload = {
            name: file.name,
            data: base64Data,
        };

        this.send({
            type: MsgTypeRulesUpload,
            payload: payload as unknown as Record<string, unknown>,
            timestamp: Date.now(),
        });

        const result = await Promise.race([
            this.waitForMessage(MsgTypeComplete, 30000),
            this.waitForMessage(MsgTypeError, 30000).then(msg => {
                const error = msg.payload as WSErrorResponse;
                throw new Error(error.message);
            }),
        ]);

        const response = result.payload as WSCompleteResponse;
        return response.result as {
            id: string;
            name: string;
            uploadedAt: string;
            rulesCount: number;
            deviceCount: number;
        };
    }

    /**
     * Upload carrier log file over WebSocket
     */
    async uploadCarrierLog(file: File): Promise<{
        sessionId: string;
        fileId: string;
        fileName: string;
    }> {
        await this.connect();

        const base64Data = await blobToBase64(file);
        const payload: FileUploadPayload = {
            name: file.name,
            data: base64Data,
        };

        this.send({
            type: MsgTypeCarrierUpload,
            payload: payload as unknown as Record<string, unknown>,
            timestamp: Date.now(),
        });

        const result = await Promise.race([
            this.waitForMessage(MsgTypeComplete, 30000),
            this.waitForMessage(MsgTypeError, 30000).then(msg => {
                const error = msg.payload as WSErrorResponse;
                throw new Error(error.message);
            }),
        ]);

        const response = result.payload as WSCompleteResponse;
        return response.result as {
            sessionId: string;
            fileId: string;
            fileName: string;
        };
    }

    /**
     * Compress file using gzip if supported
     */
    private async compressFile(file: File): Promise<Blob> {
        if (typeof CompressionStream === 'undefined') {
            return file;
        }

        try {
            const stream = file.stream();
            const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
            const response = new Response(compressedStream);
            const compressed = await response.blob();
            
            if (compressed.size < file.size * 0.95) {
                console.log(`[WebSocket] Compressed: ${file.size} → ${compressed.size} bytes`);
                return compressed;
            }
            return file;
        } catch (e) {
            console.warn('[WebSocket] Compression failed, using uncompressed:', e);
            return file;
        }
    }
}

// Singleton instance
let wsClient: WebSocketUploadClient | null = null;

/**
 * Get or create WebSocket upload client singleton
 */
export function getWebSocketClient(): WebSocketUploadClient {
    if (!wsClient) {
        wsClient = new WebSocketUploadClient();
    }
    return wsClient;
}

/**
 * Upload a file using WebSocket (chunked for large files)
 */
export async function uploadFileWebSocket(
    file: File,
    onProgress?: (progress: number, stage?: string) => void
): Promise<FileInfo> {
    const client = getWebSocketClient();
    try {
        return await client.uploadFile(file, onProgress);
    } finally {
        // Keep connection open for potential reuse, but could disconnect here
    }
}

/**
 * Upload map XML using WebSocket
 */
export async function uploadMapWebSocket(file: File): Promise<FileInfo> {
    const client = getWebSocketClient();
    return client.uploadMap(file);
}

/**
 * Upload rules YAML using WebSocket
 */
export async function uploadRulesWebSocket(file: File): Promise<{
    id: string;
    name: string;
    uploadedAt: string;
    rulesCount: number;
    deviceCount: number;
}> {
    const client = getWebSocketClient();
    return client.uploadRules(file);
}

/**
 * Upload carrier log using WebSocket
 */
export async function uploadCarrierLogWebSocket(file: File): Promise<{
    sessionId: string;
    fileId: string;
    fileName: string;
}> {
    const client = getWebSocketClient();
    return client.uploadCarrierLog(file);
}

/**
 * Close WebSocket connection
 */
export function closeWebSocket(): void {
    if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
    }
}

// Export client class for advanced usage
export { WebSocketUploadClient, CONFIG as WS_CONFIG };
