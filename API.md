# API Documentation

Current source of truth:
- Backend route registration: `backend/cmd/server/main.go`
- Frontend usage: `frontend/src/api/client.ts`

Base path: `/api`

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Service/version health response |

## WebSocket Upload

| Method | Path | Notes |
|---|---|---|
| GET | `/ws/uploads` | WebSocket upload channel |

Client message types:
- `upload:init`
- `upload:chunk`
- `upload:complete`
- `map:upload`
- `rules:upload`
- `carrier:upload`
- `ping`

Server message types:
- `connected`
- `ack`
- `progress`
- `processing`
- `complete`
- `error`
- `pong`

## Files

| Method | Path | Notes |
|---|---|---|
| POST | `/files/upload` | Base64 JSON upload |
| POST | `/files/upload/binary` | Binary upload path |
| POST | `/files/upload/chunk` | Chunk upload |
| POST | `/files/upload/complete` | Finalize chunked upload (returns job info) |
| GET | `/files/upload/:jobId/status` | SSE job status stream |
| GET | `/files/recent` | Recent files |
| GET | `/files/:id` | File metadata |
| DELETE | `/files/:id` | Delete file (only if enabled by server config) |
| PUT | `/files/:id` | Rename file |

## Parse Sessions

| Method | Path | Notes |
|---|---|---|
| POST | `/parse` | Start parse (single `fileId` or merged `fileIds`) |
| GET | `/parse/:sessionId/status` | Parse status/progress summary |
| GET | `/parse/:sessionId/progress` | SSE parse progress stream |
| GET | `/parse/:sessionId/entries` | Paginated entries |
| GET | `/parse/:sessionId/entries/msgpack` | Msgpack-encoded entries |
| GET | `/parse/:sessionId/stream` | SSE entry stream |
| POST | `/parse/:sessionId/chunk` | Time window fetch (`start`, `end`) |
| POST | `/parse/:sessionId/chunk-boundaries` | Boundary values for waveform continuity |
| GET | `/parse/:sessionId/signals` | Signal list |
| GET | `/parse/:sessionId/signal-types` | Signal types map |
| GET | `/parse/:sessionId/categories` | Category list |
| GET | `/parse/:sessionId/at-time` | Values at timestamp |
| GET | `/parse/:sessionId/index-of-time` | Row index nearest timestamp |
| GET | `/parse/:sessionId/time-tree` | Date/hour/minute index buckets |
| POST | `/parse/:sessionId/keepalive` | Keep session active |

Common query params for filtered parse views (`entries`, `index-of-time`, `time-tree`):
- `search`, `regex`, `caseSensitive`
- `categories`/`category`
- `signalNames`/`signalName`
- `deviceIds`/`deviceId`
- `signals`/`signal` (`deviceId::signalName`)
- `signalType`/`type`
- `sortColumn`/`sort`, `sortDirection`/`order`

## Map, Rules, Carrier

| Method | Path | Notes |
|---|---|---|
| GET | `/map/layout` | Current active map layout |
| POST | `/map/upload` | Upload map XML |
| POST | `/map/active` | Set active map by id |
| GET | `/map/rules` | Get active rules |
| POST | `/map/rules` | Upload rules YAML |
| GET | `/map/files/recent` | Recent map/rules files |
| GET | `/map/defaults` | List packaged default maps |
| POST | `/map/defaults/load` | Load packaged default map |
| POST | `/map/carrier-log` | Upload carrier log |
| GET | `/map/carrier-log` | Carrier log status/info |
| GET | `/map/carrier-log/entries` | Carrier entries |

## Validation Rules Config

| Method | Path | Notes |
|---|---|---|
| GET | `/config/validation-rules` | Read validation rules config |
| PUT | `/config/validation-rules` | Update validation rules config |

## Frontend Client Coverage

`frontend/src/api/client.ts` currently includes typed wrappers for all commonly used endpoints above, including:
- parsing with filters/pagination
- chunk boundary retrieval
- map/rules/default map operations
- carrier log flows
- session keepalive

For upload optimization and WebSocket helpers, see:
- `frontend/src/api/upload.ts`
- `frontend/src/api/websocketUpload.ts`
