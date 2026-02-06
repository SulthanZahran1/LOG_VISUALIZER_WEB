# Upload Handling Documentation

This document details the chunked upload system, decompression pipeline, and storage layer design.

## Overview

The CIM Visualizer backend implements a **streaming chunked upload architecture** designed to handle files of any size without exhausting server memory. The system supports:

- **Parallel chunk uploads**: Multiple chunks can be uploaded concurrently
- **Streaming decompression**: Gzip-compressed files are decompressed on-the-fly
- **Async processing**: Large file processing happens in background goroutines
- **Real-time progress**: SSE streams provide progress updates during processing

## Upload Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              Upload Flow                                   │
└────────────────────────────────────────────────────────────────────────────┘

1. INITIATION (Optional)
   ┌─────────────────┐
   │ POST /api/upload │
   │ - Returns uploadId │
   └─────────────────┘
        │
        ▼

2. CHUNK UPLOADS (Multiple, can be parallel)
   ┌─────────────────────────────────────────────────────────────────┐
   │ POST /api/files/upload/chunk                                     │
   │ Body: {                                                         │
   │   "uploadId": "uuid",      // Unique upload identifier          │
   │   "chunkIndex": 0,         // 0-based chunk number              │
   │   "data": "base64...",     // Base64-encoded chunk data         │
   │   "totalChunks": 10,        // Expected total chunks            │
   │   "compressed": false       // Whether chunk is compressed      │
   │ }                                                                │
   └─────────────────────────────────────────────────────────────────┘
         │
         │ Creates: data/uploads/chunks/<uploadId>/chunk_<index>
         │
         ▼

3. COMPLETE UPLOAD
   ┌─────────────────────────────────────────────────────────────────┐
   │ POST /api/files/upload/complete                                 │
   │ Body: {                                                         │
   │   "uploadId": "uuid",                                           │
   │   "name": "file.log.gz",                                        │
   │   "totalChunks": 10,                                            │
   │   "originalSize": 1234567890,   // Uncompressed size in bytes   │
   │   "compressedSize": 12345678,    // Compressed size in bytes    │
   │   "encoding": "gzip"                                            │
   │ }                                                                │
   │                                                                  │
   │ Returns: {                                                      │
   │   "jobId": "uuid",           // For tracking progress           │
   │   "status": "processing"                                         │
   │ }                                                                │
   └─────────────────────────────────────────────────────────────────┘
         │
         ▼

4. ASYNC PROCESSING (Background)
   ┌─────────────────────────────────────────────────────────────────┐
   │                    upload.StartJob()                            │
   │                                                                 │
   │ Stage 1: ASSEMBLE (0-40%)                                       │
   │   ├── Read all chunks from chunks/<uploadId>/                   │
   │   ├── Concatenate to data/uploads/<fileUuid>                    │
   │   ├── Update status to "assembling"                             │
   │   └── Cleanup chunk directory                                   │
   │                                                                 │
   │ Stage 2: DECOMPRESS (40-90%)                                    │
   │   ├── Detect gzip magic bytes (0x1f 0x8b)                       │
   │   ├── Stream decompress to temp file                            │
   │   ├── Validate decompressed size matches originalSize           │
   │   ├── Replace original with decompressed                        │
   │   └── Update progress with streaming                            │
   │                                                                 │
   │ Stage 3: COMPLETE                                               │
   │   ├── Register file in storage                                  │
   │   ├── Update status to "complete"                               │
   │   └── Store FileInfo for retrieval                              │
   └─────────────────────────────────────────────────────────────────┘
         │
         ▼

5. PROGRESS STREAMING (SSE)
   ┌─────────────────────────────────────────────────────────────────┐
   │ GET /api/files/upload/:jobId/status                              │
   │                                                                 │
   │ Content-Type: text/event-stream                                 │
   │                                                                 │
   │ Events:                                                         │
   │   data: {                                                       │
   │     "jobId": "uuid",                                            │
   │     "status": "decompressing",                                   │
   │     "progress": 65.5,                                           │
   │     "stage": "decompressing file",                              │
   │     "stageProgress": 51.0,                                      │
   │     "fileInfo": {...},  // Present on complete                 │
   │     "error": ""                                                  │
   │   }                                                              │
   └─────────────────────────────────────────────────────────────────┘
```

## Chunk Management

### Chunk Storage

Chunks are stored temporarily during upload:

```
data/uploads/
├── chunks/
│   └── <uploadId>/
│       ├── chunk_0          # Binary chunk file
│       ├── chunk_1
│       └── chunk_2
├── <fileUuid>               # Final assembled file (after completion)
└── .delete/                 # Files pending deletion
```

### Chunk Assembly

```go
// From storage/manager.go
func (s *LocalStore) CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
    id := uuid.New().String()
    finalPath := filepath.Join(s.uploadDir, id)
    chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)

    out, err := os.Create(finalPath)
    if err != nil {
        return nil, fmt.Errorf("creating final file: %w", err)
    }
    defer out.Close()

    var totalSize int64
    for i := 0; i < totalChunks; i++ {
        chunkPath := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", i))
        in, err := os.Open(chunkPath)
        if err != nil {
            return nil, fmt.Errorf("opening chunk %d: %w", i, err)
        }

        n, err := io.Copy(out, in)
        in.Close()
        if err != nil {
            return nil, fmt.Errorf("copying chunk %d: %w", i, err)
        }
        totalSize += n
    }

    // Cleanup chunks immediately after assembly
    os.RemoveAll(chunkDir)

    return &FileInfo{ID: id, Size: totalSize, ...}, nil
}
```

## Decompression Pipeline

### Streaming Decompression

The decompression uses **streaming I/O** to avoid loading entire files into memory:

```go
// From upload/manager.go
func (m *Manager) decompressFileWithProgress(job *Job, fileID string) error {
    path, err := m.store.GetFilePath(fileID)
    if err != nil {
        return err
    }

    // Open compressed file
    compressedFile, err := os.Open(path)
    if err != nil {
        return err
    }
    defer compressedFile.Close()

    // Validate gzip magic number
    magic := make([]byte, 2)
    if _, err := compressedFile.Read(magic); err != nil {
        return err
    }
    if magic[0] != 0x1f || magic[1] != 0x8b {
        return fmt.Errorf("not a gzip file")
    }
    compressedFile.Seek(0, 0)

    // Create gzip reader
    reader, err := gzip.NewReader(compressedFile)
    if err != nil {
        return err
    }
    defer reader.Close()

    // Create temp file for decompressed data
    tempPath := path + ".decompressing"
    outFile, err := os.Create(tempPath)
    if err != nil {
        return err
    }

    // Stream decompress with progress tracking
    buf := make([]byte, 1024*1024) // 1MB buffer
    var written int64
    lastProgressUpdate := time.Now()

    for {
        n, readErr := reader.Read(buf)
        if n > 0 {
            _, writeErr := outFile.Write(buf[:n])
            if writeErr != nil {
                outFile.Close()
                os.Remove(tempPath)
                return fmt.Errorf("write error: %w", writeErr)
            }
            written += int64(n)

            // Update progress every 100ms
            if time.Since(lastProgressUpdate) > 100*time.Millisecond {
                progress := float64(written) / float64(job.OriginalSize) * 100
                m.updateJobStatus(job, StatusDecompressing, "decompressing file", progress)
                lastProgressUpdate = time.Now()
            }
        }
        if readErr == io.EOF {
            break
        }
    }

    outFile.Close()

    // Validate size matches expected
    if written != job.OriginalSize {
        os.Remove(tempPath)
        return fmt.Errorf("decompressed size mismatch: got %d, expected %d", written, job.OriginalSize)
    }

    // Atomic rename (Unix: replaces file, not append)
    if err := os.Rename(tempPath, path); err != nil {
        os.Remove(tempPath)
        return err
    }

    return nil
}
```

### Progress Calculation

Progress is calculated in stages:

```go
// Stage progress mapping
StatusAssembling:    0-40%   (0.4 multiplier)
StatusDecompressing: 40-90%  (0.5 multiplier, starts at 40)
StatusComplete:      100%
```

## Memory Management

### Why Streaming Matters

For a 1GB compressed (10GB uncompressed) log file:

| Approach | Peak Memory | Time |
|---------|------------|------|
| Load entire file | 11GB | Fast but OOM risk |
| Streaming (this system) | ~10MB | Slightly slower |

### Memory Usage Breakdown

```
Chunk Upload:           ~1MB   (one chunk in memory)
Chunk Assembly:         ~50MB  (file handles + small buffer)
Decompression:         ~2MB   (1MB read + 1MB write buffers)
DuckDB Parse:          ~1GB   (DuckDB memory limit)
```

### Batch Insertion

DuckDB uses batch inserts to minimize memory:

```go
// Batch size: 50K entries
const batchSize = 50000

func (ds *DuckStore) AddEntry(entry *models.LogEntry) {
    ds.batch = append(ds.batch, entry)

    if len(ds.batch) >= ds.batchSize {
        ds.flushBatch()  // Write 50K entries at once
    }
}
```

## Client Implementation Example

### JavaScript/TypeScript Upload

```typescript
interface ChunkUploadResponse {
  jobId: string;
  status: 'processing' | 'complete' | 'error';
}

interface ProgressEvent {
  jobId: string;
  status: string;
  progress: number;
  stage: string;
  stageProgress: number;
  fileInfo?: {
    id: string;
    size: number;
    name: string;
  };
  error?: string;
}

class ChunkedUploader {
  private chunkSize = 5 * 1024 * 1024; // 5MB chunks
  private uploadId: string;
  private chunks: File[] = [];

  async upload(file: File, encoding: 'none' | 'gzip' = 'none'): Promise<ChunkUploadResponse> {
    // Generate upload ID
    this.uploadId = crypto.randomUUID();
    
    // Split into chunks
    this.chunks = this.splitFile(file);
    
    // Upload chunks in parallel (max 3 concurrent)
    await this.uploadChunksParallel(3);
    
    // Complete upload
    const response = await fetch('/api/files/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: this.uploadId,
        name: file.name,
        totalChunks: this.chunks.length,
        originalSize: file.size,
        encoding
      })
    });
    
    return response.json();
  }

  private splitFile(file: File): File[] {
    const chunks: File[] = [];
    for (let i = 0; i < file.size; i += this.chunkSize) {
      const chunk = file.slice(i, i + this.chunkSize);
      chunks.push(chunk as File);
    }
    return chunks;
  }

  private async uploadChunksParallel(maxConcurrent: number): Promise<void> {
    const results: Promise<void>[] = [];
    
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const uploadPromise = this.uploadChunk(i, chunk);
      
      results.push(uploadPromise);
      
      // Limit concurrency
      if (results.length >= maxConcurrent) {
        await Promise.race(results);
      }
    }
    
    await Promise.all(results);
  }

  private async uploadChunk(index: number, chunk: File): Promise<void> {
    const data = await this.readChunkAsBase64(chunk);
    
    await fetch('/api/files/upload/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: this.uploadId,
        chunkIndex: index,
        data,
        compressed: false
      })
    });
  }

  private readChunkAsBase64(chunk: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(chunk);
    });
  }

  streamProgress(jobId: string, onProgress: (event: ProgressEvent) => void): EventSource {
    const eventSource = new EventSource(`/api/files/upload/${jobId}/status`);
    
    eventSource.onmessage = (e) => {
      const progress = JSON.parse(e.data) as ProgressEvent;
      onProgress(progress);
      
      if (progress.status === 'complete' || progress.status === 'error') {
        eventSource.close();
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
    };
    
    return eventSource;
  }
}

// Usage
const uploader = new ChunkedUploader();
const result = await uploader.upload(myLogFile, 'gzip');

const eventSource = uploader.streamProgress(result.jobId, (progress) => {
  console.log(`${progress.stage}: ${progress.stageProgress.toFixed(1)}%`);
  
  if (progress.status === 'complete') {
    console.log('Upload complete!', progress.fileInfo);
  }
  
  if (progress.status === 'error') {
    console.error('Upload failed:', progress.error);
  }
});
```

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `chunk not found` | Missing chunk index | Re-upload missing chunk |
| `decompressed size mismatch` | Corrupted gzip or wrong originalSize | Verify originalSize header |
| `not a gzip file` | Missing gzip magic bytes | Ensure file is gzip-compressed |
| `job not found` | Expired or invalid jobId | Start new upload |

### Retry Strategy

```typescript
async function uploadWithRetry<T>(
  url: string,
  body: unknown,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return response.json();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Performance Optimization

### Recommended Chunk Sizes

| Network | Recommended Size |
|---------|------------------|
| LAN (1Gbps) | 10-20MB |
| Fast WiFi | 5-10MB |
| Standard WiFi | 2-5MB |
| Mobile | 1-2MB |

### Parallel Uploads

The system handles parallel chunk uploads correctly:

```go
// From storage/manager.go
// Chunks are saved independently with thread-safe file operations
func (s *LocalStore) SaveChunk(uploadID string, chunkIndex int, r io.Reader) error {
    chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
    os.MkdirAll(chunkDir, 0755)  // Safe for concurrent calls
    
    path := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", chunkIndex))
    f, err := os.Create(path)
    // ...
    return nil
}
```

### Connection Pooling

For high-throughput uploads, use HTTP/2 (which multiplexes over a single connection):

```bash
# curl with HTTP/2
curl --http2 -X POST http://localhost:8089/api/files/upload/chunk \
  -H "Content-Type: application/json" \
  -d '{"uploadId":"...","chunkIndex":0,"data":"..."}'
```

## API Reference

### POST /api/files/upload/chunk

Upload a single file chunk.

**Request:**
```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "chunkIndex": 0,
  "data": "SGVsbG8gV29ybGQh...",  // Base64-encoded
  "totalChunks": 10,
  "compressed": false
}
```

**Response:** `202 Accepted`

### POST /api/files/upload/complete

Complete the chunked upload and start async processing.

**Request:**
```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "production_log_2024.log.gz",
  "totalChunks": 100,
  "originalSize": 10737418240,   // 10GB in bytes
  "compressedSize": 1073741824,  // 1GB in bytes
  "encoding": "gzip"
}
```

**Response:**
```json
{
  "jobId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "processing"
}
```

### GET /api/files/upload/:jobId/status

Server-Sent Events stream for upload progress.

**Response:**
```
data: {"jobId":"660e8400...","status":"decompressing","progress":65.5,"stage":"decompressing file","stageProgress":51.0}

data: {"jobId":"660e8400...","status":"complete","progress":100,"stage":"complete","stageProgress":100,"fileInfo":{"id":"770e8400...","name":"production_log_2024.log","size":10737418240}}
```

### GET /api/files/:id

Get file metadata after upload is complete.

**Response:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "name": "production_log_2024.log",
  "size": 10737418240,
  "uploadedAt": "2024-02-04T13:45:00Z",
  "status": "uploaded"
}
```
