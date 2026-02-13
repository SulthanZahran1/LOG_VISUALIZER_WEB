# API Integration Documentation

> **Start Here:** Read [AGENTS.md](./AGENTS.md) first for project context.

This document describes the frontend-backend communication layer for CIM Visualizer, covering HTTP and WebSocket upload protocols, compression strategies, and error handling.

## Overview

The frontend communicates with the backend via:
- **REST API** (`:8089/api`) - Standard HTTP endpoints for health, files, parsing, and maps
- **WebSocket** (`:8089/api/ws/uploads`) - Persistent connections for large file uploads

### Base URLs

| Environment | REST API | WebSocket |
|------------|----------|-----------|
| Development | `/api` (via Vite proxy) | `/api/ws/uploads` |
| Production | `/api` (via nginx) | `/api/ws/uploads` |

---

## API Endpoints

### Health Check

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Check backend health status |

**Response:**
```typescript
interface HealthResponse {
    status: string; // "healthy" or error message
}
```

### Files

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/upload` | Single file upload (base64 JSON) |
| POST | `/api/files/upload/chunk` | Upload single chunk (base64 JSON) |
| POST | `/api/files/upload/complete` | Signal chunked upload completion |
| GET | `/api/files/upload/:jobId/status` | SSE progress stream |
| GET | `/api/files/recent` | List recent files |
| GET | `/api/files/:id` | Get file info |
| DELETE | `/api/files/:id` | Delete file |
| PUT | `/api/files/:id` | Rename file |

### Parse Sessions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/parse` | Start parsing (single or merged) |
| GET | `/api/parse/:sessionId/status` | Get parse session status |
| GET | `/api/parse/:sessionId/signals` | List all signal names |
| GET | `/api/parse/:sessionId/categories` | List all categories |
| GET | `/api/parse/:sessionId/entries` | Paginated log entries |
| POST | `/api/parse/:sessionId/chunk` | Get entry range (large requests) |
| POST | `/api/parse/:sessionId/at-time` | Values at specific timestamp |
| GET | `/api/parse/:sessionId/stream` | SSE event stream |
| POST | `/api/parse/:sessionId/keepalive` | Keep session alive while actively viewing |

### Map & Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/map/layout` | Get current map layout |
| POST | `/api/map/upload` | Upload map XML |
| POST | `/api/map/rules` | Upload rules YAML |
| GET | `/api/map/rules` | Get current map rules |
| POST | `/api/map/active` | Set active map |
| GET | `/api/map/files/recent` | Recent map files |
| GET | `/api/map/defaults` | List default maps |
| POST | `/api/map/defaults/load` | Load default map |

### Carrier Log

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/map/carrier-log` | Upload carrier log |
| GET | `/api/map/carrier-log` | Get carrier log status |
| GET | `/api/map/carrier-log/entries` | Get carrier entries |

---

## Upload Architecture

### Two Upload Strategies

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| **HTTP Chunked** | General uploads | Simple, well-supported | More overhead per chunk |
| **WebSocket** | Large files (>50MB) | Single connection, real-time updates | More complex state |

### HTTP Chunked Upload Flow

```
File → Compress (gzip) → Slice (5MB chunks) → Parallel Upload → SSE Progress → Complete
```

**Steps:**
1. **Compression** - Entire file compressed with gzip (80-95% reduction for logs)
2. **Chunking** - Compressed data sliced into 5MB chunks
3. **Parallel Upload** - 3 concurrent chunk uploads with retry + backoff
4. **Completion** - Signal `upload/complete` with metadata
5. **Progress Tracking** - SSE stream polls `/files/upload/:jobId/status`

### WebSocket Upload Flow

```
Connect → Init → Chunk Stream → Complete → Real-time Progress
```

**Message Types:**
- `upload:init` - Initialize upload with metadata
- `upload:chunk` - Send chunk (base64)
- `upload:complete` - Signal completion
- `progress` - Server confirms chunk receipt
- `processing` - Server-side processing updates
- `complete` - Final success with FileInfo
- `error` - Error message

---

## Compression Strategy

### Current: gzip

| Stage | Compression | Ratio |
|-------|-------------|-------|
| Whole file | gzip (CompressionStream API) | 80-95% for text logs |

**Code Path:**
```typescript
const compressed = await new Response(
    file.stream().pipeThrough(new CompressionStream('gzip'))
).blob();
```

### Compression Configuration

```typescript
const CONFIG = {
    CHUNK_SIZE: 5 * 1024 * 1024,      // 5MB compressed chunks
    MAX_CONCURRENT: 3,                 // Parallel uploads
    MAX_RETRIES: 3,                    // Retry attempts
    BASE_DELAY_MS: 1000,               // Backoff base
    COMPRESSION_THRESHOLD: 100 * 1024, // Only compress > 100KB
    SINGLE_UPLOAD_THRESHOLD: 5 * 1024 * 1024, // Small files: single upload
};
```

---

## Chunked Upload Protocol

### 1. Chunk Upload Endpoint

**POST** `/api/files/upload/chunk`

**Request Body:**
```json
{
    "uploadId": "abc123-xyz",
    "chunkIndex": 0,
    "data": "<base64-encoded-chunk>",
    "totalChunks": 10,
    "compressed": true
}
```

**Response:** `200 OK` on success, `4xx/5xx` on failure

### 2. Retry Logic

```typescript
async function uploadChunkWithRetry(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    totalChunks: number,
    compressed: boolean,
    retryCount = 0
): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000;

    try {
        const response = await fetch('/api/files/upload/chunk', {
            method: 'POST',
            body: JSON.stringify({ uploadId, chunkIndex, data: base64, ... }),
        });
    } catch (error) {
        if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount);
            await sleep(delay);
            return uploadChunkWithRetry(..., retryCount + 1);
        }
        throw error;
    }
}
```

### 3. Completion Endpoint

**POST** `/api/files/upload/complete`

**Request Body:**
```json
{
    "uploadId": "abc123-xyz",
    "name": "plc_log.txt",
    "totalChunks": 10,
    "originalSize": 123456789,
    "compressedSize": 12345678,
    "encoding": "gzip"
}
```

**Response:**
```json
{
    "jobId": "job_abc123"
}
```

### 4. Progress Tracking (SSE)

**GET** `/api/files/upload/:jobId/status`

**Server-Sent Events:**
```typescript
interface UploadJob {
    id: string;
    uploadId: string;
    fileName: string;
    totalChunks: number;
    originalSize: number;
    compressedSize: number;
    encoding: string;
    status: 'processing' | 'assembling' | 'decompressing' | 'complete' | 'error';
    progress: number;        // 0-100
    stage: string;           // 'preparing' | 'assembling chunks' | 'decompressing file'
    stageProgress: number;  // 0-100
    fileInfo?: FileInfo;
    error?: string;
}
```

**Example Stream:**
```
data: {"status":"processing","progress":10,"stage":"preparing"}
data: {"status":"assembling","progress":50,"stage":"assembling chunks","stageProgress":50}
data: {"status":"decompressing","progress":75,"stage":"decompressing file","stageProgress":75}
data: {"status":"complete","progress":100,"fileInfo":{"id":"...","name":"..."}}
```

---

## WebSocket Protocol

### Connection

```typescript
const WS_BASE = `${window.location.protocol}//${window.location.host}/api/ws/uploads`;
const ws = new WebSocket(WS_BASE);
```

### Message Format

```typescript
interface WSMessage {
    type: string;     // Message type constant
    id?: string;      // Correlation ID
    payload?: unknown;
    timestamp: number;
}
```

### Upload Flow

```typescript
// 1. Initialize
ws.send({
    type: 'upload:init',
    payload: {
        fileName: 'log.txt',
        totalChunks: 20,
        totalSize: 100000000,
        encoding: 'gzip',
    },
    timestamp: Date.now(),
});

// 2. Receive ack with uploadId
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ack') {
        const uploadId = msg.id;
        // Start sending chunks...
    }
};

// 3. Send chunks
for (let i = 0; i < totalChunks; i++) {
    ws.send({
        type: 'upload:chunk',
        payload: {
            uploadId,
            chunkIndex: i,
            data: base64Chunk,
            isLast: i === totalChunks - 1,
        },
        timestamp: Date.now(),
    });
}

// 4. Complete
ws.send({
    type: 'upload:complete',
    payload: { uploadId, fileName, totalChunks, ... },
    timestamp: Date.now(),
});

// 5. Receive result
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'complete') {
        const fileInfo = msg.payload.fileInfo;
    }
};
```

### Keepalive

```typescript
// Client sends ping every 30 seconds
setInterval(() => {
    ws.send({ type: 'ping', timestamp: Date.now() });
}, 30000);

// Server responds with pong
```

---

## Error Handling

### ApiError Class

```typescript
class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}
```

### UploadError Class

```typescript
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
```

### Error Codes

| Status | Meaning | Retryable? |
|--------|---------|------------|
| 400 | Bad request (invalid chunk) | No |
| 413 | Payload too large | No |
| 429 | Rate limited | Yes |
| 500 | Internal server error | Yes |
| 502/503/504 | Server unavailable | Yes |

### Error Handling Pattern

```typescript
try {
    const result = await uploadFileOptimized(file, onProgress);
    console.log('Upload complete:', result);
} catch (error) {
    if (error instanceof UploadError) {
        if (error.retryable) {
            console.warn('Retryable error:', error.message);
        } else {
            console.error('Fatal error:', error.message);
        }
    } else {
        console.error('Unexpected error:', error);
    }
}
```

---

## Progress Tracking

### HTTP Upload Progress

```typescript
async function uploadFileOptimized(
    file: File,
    onProgress?: (progress: number, stage?: string) => void
): Promise<FileInfo> {
    // Stage 1: Compression (0-5%)
    onProgress?.(5, 'Compressing file...');

    // Stage 2: Chunk Upload (10-90%)
    // Progress = 10 + (chunkProgress * 0.8)
    onProgress?.(50, 'Uploading chunks (50%)...');

    // Stage 3: Server Processing (90-100%)
    // Progress = 90 + (serverProgress * 0.1)
    onProgress?.(95, 'Decompressing file...');
    onProgress?.(100, 'Complete!');
}
```

### WebSocket Progress

```typescript
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'progress') {
        // Upload progress: 0-85%
        const clientProgress = Math.round(msg.progress * 0.85);
        onProgress?.(clientProgress, msg.message);
    }

    if (msg.type === 'processing') {
        // Processing progress: 85-95%
        const clientProgress = 85 + Math.round(msg.progress * 0.1);
        onProgress?.(clientProgress, msg.message);
    }
};
```

---

## Progress Stages Reference

| Stage | Progress Range | Description |
|-------|---------------|-------------|
| `preparing` | 0-5% | Initial compression |
| `uploading` | 5-75% | Chunk transfer |
| `verifying` | 75-85% | Server processing starts |
| `processing` | 85-98% | Assemble, decompress, parse |
| `finalizing` | 98-100% | Indexing, completing |
| `complete` | 100% | Upload done |

---

## File Size Recommendations

| File Size | Strategy | Reason |
|-----------|----------|--------|
| < 100KB | Single upload | Compression overhead not worth it |
| 100KB - 5MB | HTTP chunked (1 chunk) | Simple, fast |
| 5MB - 50MB | HTTP chunked (multiple) | Good compression + parallel upload |
| > 50MB | WebSocket | Avoids HTTP overhead, real-time updates |

---

## Type References

### Core Types

```typescript
interface FileInfo {
    id: string;
    name: string;
    size: number;
    uploadedAt: string;
    status: 'uploaded' | 'parsing' | 'parsed' | 'error';
}

interface ParseSession {
    id: string;
    fileId: string;
    status: 'pending' | 'parsing' | 'complete' | 'error';
    progress: number;
    entryCount?: number;
    signalCount?: number;
}

interface LogEntry {
    deviceId: string;
    signalName: string;
    timestamp: number;  // Unix ms
    value: boolean | string | number;
    signalType: 'boolean' | 'string' | 'integer';
    category?: string;
}
```

---

## Related Files

| File | Purpose |
|------|---------|
| `frontend/src/api/client.ts` | Main API client |
| `frontend/src/api/upload.ts` | Optimized HTTP upload |
| `frontend/src/api/websocketUpload.ts` | WebSocket upload client |
| `frontend/src/utils/base64.ts` | Blob ↔ Base64 conversion |
| `frontend/src/models/types.ts` | TypeScript interfaces |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-02-13 | Added session keep-alive endpoint, updated progress stages, removed zstd roadmap |
| 2026-02-04 | Added WebSocket protocol details |
| 2026-02-04 | Initial documentation |

## Documentation Index

| Document | When to Reference |
|----------|------------------|
| **[AGENTS.md](./AGENTS.md)** | Project overview, development guidelines |
| **[frontend/FRONTEND.md](./frontend/FRONTEND.md)** | Frontend architecture |
| **[backend/README.md](./backend/README.md)** | Backend architecture |
| **[backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)** | Upload pipeline internals |
