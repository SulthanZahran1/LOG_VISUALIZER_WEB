# Upload Handling

Last updated: 2026-03-08

## Overview

Upload pipeline supports both:
- HTTP uploads (`/api/files/upload` and chunked endpoints)
- WebSocket uploads (`/api/ws/uploads`)

Core components:
- `internal/storage`: chunk persistence and file registration
- `internal/upload`: async job manager and processing stages
- `internal/api/handlers_upload.go` and `internal/api/websocket.go`

## HTTP Chunked Flow

1. Client sends chunks to `POST /api/files/upload/chunk`.
2. Chunks are stored at `data/uploads/chunks/<uploadId>/chunk_<n>`.
3. Client calls `POST /api/files/upload/complete`.
4. Upload manager assembles and processes the file in the background.
5. Client tracks progress over SSE at `GET /api/files/upload/:jobId/status`.

## Processing Stages

Typical job stages:
- chunk assembly
- optional gzip decompression
- final file registration in storage

Implementation favors streaming I/O to avoid loading large files fully into memory.

## WebSocket Upload Flow

Message types from client to server:
- `upload:init`
- `upload:chunk`
- `upload:complete`
- `map:upload`
- `rules:upload`
- `carrier:upload`

Completion and progress are emitted as structured messages such as `progress`, `processing`, `complete`, and `error`.

## Related Docs

- [../API.md](../API.md)
- [./README.md](./README.md)
- [./STORAGE.md](./STORAGE.md)
- [../frontend/FRONTEND.md](../frontend/FRONTEND.md)
