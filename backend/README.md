# CIM Visualizer Backend Documentation

> **Start Here:** Read [AGENTS.md](../AGENTS.md) first for project context and development guidelines.

## Overview

The CIM Visualizer backend is a Go-based HTTP API server designed for processing and visualizing CIM (Computer Integrated Manufacturing) log files. It supports chunked uploads, streaming decompression, memory-efficient parsing using DuckDB, and real-time progress streaming via Server-Sent Events (SSE).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP API Layer                           │
│                    (Echo Framework)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │Handlers  │ │WebSocket │ │  SSE     │ │  Middleware      │   │
│  │(api/)    │ │Handler   │ │Streams   │ │(CORS, Gzip, etc)│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────▼──────────────────────────────────┐
│                        Upload Layer                              │
│                     (internal/upload/)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Chunk Assembly → Gzip Decompression → Storage            │  │
│  │  Async Job Processing with SSE Progress Tracking          │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────▼──────────────────────────────────┐
│                        Storage Layer                             │
│                   (internal/storage/)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LocalStore: Local filesystem with in-memory index        │  │
│  │  - File chunk management                                  │  │
│  │  - Chunk assembly & cleanup                               │  │
│  │  - UUID-based file identification                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────▼──────────────────────────────────┐
│                      Parsing Layer                               │
│                   (internal/parser/)                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐   │
│  │ PLCDebug    │ │  Binary     │ │   DuckDB Storage        │   │
│  │ CSV Parser  │ │  Format     │ │   (1GB memory limit)    │   │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────▼──────────────────────────────────┐
│                      Session Layer                               │
│                  (internal/session/)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SessionManager: Orchestrates parsing sessions            │  │
│  │  - DuckDB-backed storage for large files                  │  │
│  │  - In-memory storage for small files                      │  │
│  │  - Automatic cleanup (30min max age)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Key Packages

### `internal/api/handlers.go`

API handlers for all HTTP endpoints. Main responsibilities:

- **File Management**: Upload, download, rename, delete
- **Parse Sessions**: Start parsing, query progress, retrieve entries
- **Map Layouts**: Upload/manage map XML and rule YAML files
- **Carrier Tracking**: AMHS carrier log processing
- **Real-time Streams**: SSE for progress and entry streaming

#### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/upload` | Upload file (base64 JSON) |
| POST | `/api/files/upload/binary` | Upload pre-encoded binary format |
| POST | `/api/files/upload/chunk` | Upload single chunk |
| POST | `/api/files/upload/complete` | Complete chunked upload |
| GET | `/api/files/upload/:jobId/status` | SSE progress stream |
| GET | `/api/files/recent` | List recent files |
| POST | `/api/parse` | Start parsing session |
| GET | `/api/parse/:sessionId/progress` | SSE parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/stream` | SSE entry streaming |
| POST | `/api/parse/:sessionId/chunk` | Time-windowed entries |
| GET | `/api/map/layout` | Get active map layout |
| POST | `/api/map/upload` | Upload map XML |
| GET | `/api/map/rules` | Get active rules |
| POST | `/api/map/rules` | Upload rules YAML |

### `internal/upload/manager.go`

Async upload processing manager handling chunked uploads and decompression.

#### Upload Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Client       │────▶│ Chunked      │────▶│ Assemble     │────▶│ Decompress   │
│ Uploads      │     │ Upload       │     │ Chunks       │     │ (if gzip)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Base64 JSON  │     │ Temporary    │     │ Final File  │     │ Streaming    │
│ or Binary    │     │ Chunk Files  │     │ (UUID)       │     │ Decompress   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

#### Processing Stages

1. **StatusAssembling** (0-40%): Chunks are assembled into a single file
2. **StatusDecompressing** (40-90%): Gzip decompression with progress tracking
3. **StatusComplete** (100%): File registered in storage

#### Memory-Efficient Decompression

```go
// Uses streaming I/O to avoid loading entire file into memory
reader, err := gzip.NewReader(compressedFile)
outFile, err := os.Create(tempPath)
io.Copy(outFile, reader)  // Streams data in 1MB chunks
```

### `internal/storage/manager.go`

Local filesystem storage implementation.

#### Features

- **Chunk Management**: Temporary chunk storage in `uploadDir/chunks/<uploadID>/`
- **Atomic Assembly**: Chunks assembled to final file, then chunks cleaned up
- **Thread-Safe**: RWMutex protects file index
- **In-Memory Index**: Fast file lookup without database

#### File Structure

```
data/uploads/
├── <file_uuid>          # Final assembled file
└── chunks/
    └── <upload_id>/     # Temporary chunk storage
        ├── chunk_0
        ├── chunk_1
        └── ...
```

### `internal/session/manager.go`

Session management orchestrating parsing workflows.

#### Key Concepts

- **MaxSessions**: 10 concurrent sessions (prevents memory exhaustion)
- **SessionMaxAge**: 30 minutes for completed sessions
- **Dual Storage**:
  - DuckDB for large files (>100K entries)
  - In-memory for small files

#### Parsing Flow

```
StartSession
    │
    ▼
┌───────────────┐
│ Find Parser   │  ◀── Registry auto-detects format
└───────────────┘
    │
    ▼
┌───────────────────────┐
│ Choose Storage        │
│ - DuckDB: PLC logs    │
│ - In-memory: others   │
└───────────────────────┘
    │
    ▼
┌───────────────────────┐
│ Parse with Progress   │  ◀── SSE updates every 100ms
└───────────────────────┘
    │
    ▼
┌───────────────────────┐
│ Session Complete      │  ◀── Ready for queries
└───────────────────────┘
```

### `internal/parser/duckstore.go`

DuckDB-backed storage for memory-efficient parsing of large files.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DuckStore Layer                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    In-Memory Batch                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                     │  │
│  │  │ │ │ 50K     │ │ 50K     50K     │ ...                │  │
│  │  │ Entries │ │ Entries │ │ Entries │                     │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘                     │  │
│  └───────┼───────────┼───────────┼───────────────────────────┘  │
│          │           │           │                               │
│          ▼           ▼           ▼                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              DuckDB Appender API (High Performance)        │  │
│  │  - 50K rows per batch                                      │  │
│  │  - Native bulk insert                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                          │
│                         ▼                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              DuckDB File (1GB Memory Limit)                │  │
│  │  - entries table with indexes                              │  │
│  │  - idx_ts (timestamp for chunk queries)                    │  │
│  │  - idx_device, idx_signal (for large datasets)              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Query Optimization

- **Keyset Pagination**: O(log n) for deep pagination (vs O(n) for OFFSET)
- **Query Semaphore**: Max 3 concurrent queries to prevent memory spikes
- **Count Caching**: Caches filtered counts to avoid repeated COUNT queries
- **Time Range Indexes**: Optimized for GetChunk queries

#### Memory Configuration

```go
PRAGMA memory_limit='1GB'     // Parse phase
PRAGMA memory_limit='1536MB' // Index creation
PRAGMA threads=4              // Parallel processing
```

## Memory Management

### Streaming Architecture

All file processing uses streaming I/O to minimize memory footprint:

```go
// Upload: Stream directly to disk
io.Copy(f, r)

// Decompression: Streaming gzip
io.Copy(outFile, gzipReader)

// Parsing: Batch inserts to DuckDB
io.Copy(appender, fileReader)
```

### Memory Limits

| Component | Limit | Purpose |
|-----------|-------|---------|
| DuckDB Parse | 1GB | Prevent OOM during parsing |
| DuckDB Index | 1.5GB | Safe index creation |
| Query Semaphore | 3 concurrent | Prevent query memory spikes |
| Max Sessions | 10 | Limit concurrent parsing |
| Chunk Buffer | 1MB | Decompression buffer |

### Memory Monitoring

```go
// Log memory usage every 500K lines
runtime.ReadMemStats(&memStats)
fmt.Printf("Memory: %.1f MB (alloc) / %.1f MB (sys)\n", 
    float64(memStats.Alloc)/1024/1024, 
    float64(memStats.Sys)/1024/1024)
```

## API Usage Examples

### Chunked Upload with Progress

```javascript
// 1. Upload chunks sequentially
for (let i = 0; i < totalChunks; i++) {
  await fetch('/api/files/upload/chunk', {
    method: 'POST',
    body: JSON.stringify({
      uploadId: 'uuid',
      chunkIndex: i,
      data: base64Chunk,
      totalChunks
    })
  });
}

// 2. Complete upload
const response = await fetch('/api/files/upload/complete', {
  method: 'POST',
  body: JSON.stringify({
    uploadId: 'uuid',
    name: 'file.log',
    totalChunks,
    originalSize: 123456789,
    compressedSize: 12345678,
    encoding: 'gzip'
  })
});
const { jobId } = await response.json();

// 3. Stream progress
const eventSource = new EventSource(`/api/files/upload/${jobId}/status`);
eventSource.onmessage = (e) => {
  const progress = JSON.parse(e.data);
  console.log(`${progress.stage}: ${progress.stageProgress}%`);
  if (progress.status === 'complete') {
    eventSource.close();
  }
};
```

### Parse and Query Entries

```javascript
// 1. Start parse
const parseRes = await fetch('/api/parse', {
  method: 'POST',
  body: JSON.stringify({ fileId: 'file-uuid' })
});
const { id: sessionId } = await parseRes.json();

// 2. Stream progress
const progressSrc = new EventSource(`/api/parse/${sessionId}/progress`);
progressSrc.onmessage = (e) => {
  const sess = JSON.parse(e.data);
  console.log(`Progress: ${sess.progress}%`);
};

// 3. Query entries (after complete)
const entriesRes = await fetch(
  `/api/parse/${sessionId}/entries?page=1&pageSize=100`
);
const { entries, total } = await entriesRes.json();
```

### Time-Range Queries

```javascript
// Get entries in time window with specific signals
const chunkRes = await fetch(`/api/parse/${sessionId}/chunk`, {
  method: 'POST',
  body: JSON.stringify({
    start: 1700000000000,  // Unix ms
    end: 1700000100000,
    signals: ['DEVICE_A::Temperature', 'DEVICE_B::Status']
  })
});
const entries = await chunkRes.json();
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DUCKDB_TEMP_DIR` | `./data/temp` | DuckDB temporary directory |
| `PORT` | `8089` | HTTP server port |

### Server Settings

```go
// From main.go
http.Server{
  ReadTimeout:  30 * time.Second,
  WriteTimeout: 30 * time.Second,
  IdleTimeout:  120 * time.Second,
}

// Middleware timeouts
Timeout: 60 * time.Second  // (excludes SSE streams)
BodyLimit: 2G
GzipLevel: 5
```

## Performance Characteristics

### Upload Performance

- **Chunked**: Parallel chunk uploads supported
- **Decompression**: ~100 MB/s streaming throughput
- **Memory**: O(1) - only current chunk in memory

### Parsing Performance

| File Size | Parser | Time | Memory |
|----------|--------|------|--------|
| 100MB | PLC Debug | ~30s | <500MB |
| 1GB | PLC Debug | ~5min | ~1GB |
| Small files | In-memory | ~5s | <50MB |

### Query Performance

| Query Type | Time | Notes |
|------------|------|-------|
| Paginated entries (100/page) | <50ms | Cached counts |
| Time-range chunk | <100ms | Indexed timestamp |
| Deep pagination (page 100+) | <200ms | Keyset pagination |
| Values at time | <50ms | Window function |

## Error Handling

### Panic Recovery

All parsing runs in goroutines with panic recovery:

```go
defer func() {
  if r := recover(); r != nil {
    fmt.Printf("[Parse %s] PANIC recovered: %v\n", sessionID[:8], r)
    m.updateSessionError(sessionID, ...)
  }
}()
```

### Timeout Middleware

- 60-second timeout on most endpoints
- Excludes: SSE streams, uploads, entry queries
- Returns: `{"error": "Request timeout - query took too long"}`

## File Formats Supported

### Text Formats

| Format | Parser | Description |
|--------|--------|-------------|
| PLC Debug | `PLCDebugParser` | Tab-separated debug logs |
| CSV | `CSVParser` | Comma-separated values |
| Binary Gzip | `BinaryFormatParser` | Pre-encoded binary + gzip |

### Binary Format

Pre-encoded binary format is 85-95% smaller than text:

```
[Magic: 4 bytes][Version: 4 bytes][Entry Count: 8 bytes]
[Entry 1: timestamp(8) + deviceLen(2) + device + signalLen(2) + signal + value]
...
```

## Running the Server

```bash
# Build
cd cmd/server && go build -o server .

# Run
./server

# With custom DuckDB temp dir
DUCKDB_TEMP_DIR=/tmp/duckdb ./server
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `github.com/labstack/echo/v4` | HTTP framework |
| `github.com/marcboeker/go-duckdb` | Embedded SQL database |
| `github.com/google/uuid` | UUID generation |
| `github.com/vmihailenco/msgpack/v5` | MessagePack encoding |

## Documentation Index

| Document | What It Covers |
|----------|----------------|
| **[UPLOAD_HANDLING.md](./UPLOAD_HANDLING.md)** | Chunked upload pipeline, compression, streaming |
| **[STORAGE.md](./STORAGE.md)** | File storage, chunk assembly, thread safety |

## See Also

| Document | When to Reference |
|----------|------------------|
| **[AGENTS.md](../AGENTS.md)** | Project overview, development guidelines |
| **[API.md](../API.md)** | REST API endpoints, WebSocket protocol |
| **[frontend/FRONTEND.md](../frontend/FRONTEND.md)** | Frontend architecture |
