# Upload Handling

## Overview

Upload pipeline supports both:
- HTTP uploads (`/api/files/upload`, chunked endpoints)
- WebSocket uploads (`/api/ws/uploads`)

Core components:
- `internal/storage`: chunk persistence and file registration
- `internal/upload`: async job manager and processing stages
- `internal/api/handlers_upload.go` and `internal/api/websocket.go`

## HTTP Chunked Flow

1. Client sends chunks to `POST /api/files/upload/chunk`
2. Chunks are stored at `data/uploads/chunks/<uploadId>/chunk_<n>`
3. Client calls `POST /api/files/upload/complete`
4. Upload manager assembles and processes file in background
5. Client tracks progress over SSE: `GET /api/files/upload/:jobId/status`

## Processing Stages

Typical job stages:
- chunk assembly
- optional gzip decompression (streaming)
- final file registration in storage index

The implementation favors streaming I/O to avoid loading full files into memory.

## WebSocket Upload Flow

Message types (client -> server):
- `upload:init`
- `upload:chunk`
- `upload:complete`
- `map:upload`
- `rules:upload`
- `carrier:upload`

Progress and completion are emitted as structured WS messages (`progress`, `processing`, `complete`, `error`).

## Important Paths

- `backend/internal/api/handlers_upload.go`
- `backend/internal/api/websocket.go`
- `backend/internal/upload/manager.go`
- `backend/internal/storage/manager.go`
