# Backend Documentation

## Stack
- Go 1.24
- Echo v4
- DuckDB (`go-duckdb`) for large parsed datasets

Entry point: `cmd/server/main.go`

## Responsibilities

- Serve REST + SSE + WebSocket APIs
- Persist uploads/chunks on local filesystem
- Manage parse sessions and cleanup
- Parse multiple industrial log formats
- Serve embedded frontend assets in embedded mode

## Package Map

| Package | Purpose |
|---|---|
| `internal/api` | Modular HTTP handlers (`handlers_upload.go`, `handlers_parse.go`, `handlers_map.go`, `handlers_carrier.go`, `handlers_health.go`) + websocket upload handler |
| `internal/upload` | Async upload jobs, chunk assembly/decompression orchestration |
| `internal/storage` | Local file/chunk storage and metadata index |
| `internal/session` | Parse session lifecycle and session-scoped access |
| `internal/parser` | Parser registry, format parsers, DuckStore, map/rules parsers |
| `internal/config` | XML config parsing (`PLCLogVisualizer.exe.config`) |
| `internal/web` | Embedded static frontend serving |

## Active API Route Groups

Configured in `cmd/server/main.go`:
- `/api/health`
- `/api/ws/uploads`
- `/api/files/*`
- `/api/parse/:sessionId/*`
- `/api/map/*`
- `/api/config/validation-rules`

See [../API.md](../API.md) for route details.

## Local Run

```bash
cd backend
go run cmd/server/main.go
```

## Tests

```bash
cd backend
go test ./...
```

## Notes

- Session cleanup runs periodically in a background goroutine.
- Large PLC parses use DuckDB-backed storage path for memory efficiency.
- File deletion endpoint is config-gated (`AllowFileDeletion`).
