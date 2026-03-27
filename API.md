# API Documentation

Last updated: 2026-03-27

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
| POST | `/files/upload/binary` | Multipart binary upload |
| POST | `/files/upload/chunk` | Chunk upload |
| POST | `/files/upload/complete` | Finalize chunked upload and return job info |
| GET | `/files/upload/:jobId/status` | SSE job status stream |
| GET | `/files/recent` | Recent log files |
| GET | `/files/:id` | File metadata |
| DELETE | `/files/:id` | Delete file when enabled by server config |
| PUT | `/files/:id` | Rename file |

## Parse Sessions

| Method | Path | Notes |
|---|---|---|
| POST | `/parse` | Start parse with `fileId` or merged `fileIds` |
| GET | `/parse/:sessionId/status` | Parse status/progress summary |
| GET | `/parse/:sessionId/progress` | SSE parse progress stream |
| GET | `/parse/:sessionId/entries` | Paginated entries |
| GET | `/parse/:sessionId/entries/msgpack` | Msgpack endpoint |
| GET | `/parse/:sessionId/stream` | SSE entry stream |
| POST | `/parse/:sessionId/chunk` | Time window fetch (`start`, `end`) |
| POST | `/parse/:sessionId/chunk-boundaries` | Waveform continuity values |
| GET | `/parse/:sessionId/signals` | Signal list |
| GET | `/parse/:sessionId/signal-types` | Signal types map |
| GET | `/parse/:sessionId/categories` | Category list |
| GET | `/parse/:sessionId/at-time` | Values at `timestamp` |
| GET | `/parse/:sessionId/index-of-time` | Row index nearest timestamp |
| GET | `/parse/:sessionId/time-tree` | Date/hour/minute buckets |
| POST | `/parse/:sessionId/keepalive` | Keep session active |
| POST | `/parse/:sessionId/transitions` | Transition/tact-time analysis for the full session |

Common query params for filtered parse views (`entries`, `index-of-time`, `time-tree`):
- `search`, `regex`, `caseSensitive`
- `categories` or `category`
- `signalNames` or `signalName`
- `deviceIds` or `deviceId`
- `signals` or `signal` (`deviceId::signalName`)
- `signalType` or `type`
- `sortColumn` or `sort`
- `sortDirection` or `order`

UI workflow note:
- Home view multi-file mode no longer imposes a client-side file-count cap before sending merged `fileIds`; practical limits are browser and server resources.

## Map, Rules, Carrier

| Method | Path | Notes |
|---|---|---|
| GET | `/map/layout` | Current active map layout |
| POST | `/map/upload` | Upload map XML |
| POST | `/map/active` | Set active map by id |
| GET | `/map/rules` | Get active rules |
| POST | `/map/rules` | Upload rules YAML |
| POST | `/map/rules/active` | Set active rules by id |
| GET | `/map/files/recent` | Recent map/rules files |
| GET | `/map/defaults` | List packaged default maps |
| POST | `/map/defaults/load` | Load packaged default map |
| POST | `/map/carrier-log` | Upload carrier log |
| GET | `/map/carrier-log` | Carrier log status/info |
| GET | `/map/carrier-log/entries` | Carrier entries |

## Validation Rules Config

| Method | Path | Notes |
|---|---|---|
| GET | `/config/validation-rules` | Returns placeholder rules payload |
| PUT | `/config/validation-rules` | Currently returns `501 Not Implemented` |

## Frontend Client Coverage

`frontend/src/api/client.ts` includes typed wrappers for the active UI flows:
- health, file CRUD, and parse-session lifecycle
- filtered entries, waveform chunks, chunk boundaries, values-at-time, and time tree
- transitions
- map/rules/default map operations
- carrier log flows

Dedicated wrappers are not currently present for:
- `/parse/:sessionId/entries/msgpack`
- `/config/validation-rules`

For upload optimization and WebSocket helpers, see:
- `frontend/src/api/upload.ts`
- `frontend/src/api/websocketUpload.ts`

## Related Docs

- [README.md](./README.md)
- [backend/README.md](./backend/README.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
