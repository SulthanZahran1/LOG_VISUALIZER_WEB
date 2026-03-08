# Backend Documentation

Last updated: 2026-03-08

## Stack

- Go 1.24
- Echo v4
- DuckDB (`go-duckdb`) for large parsed datasets

Entry point: `cmd/server/main.go`

## Responsibilities

- Serve REST, SSE, and WebSocket APIs
- Persist uploads/chunks on the local filesystem
- Manage parse sessions and cleanup
- Parse multiple industrial log formats
- Serve embedded frontend assets in embedded mode

## Package Map

| Package | Purpose |
|---|---|
| `internal/api` | Modular HTTP handlers plus the WebSocket upload handler |
| `internal/upload` | Async upload jobs, chunk assembly, and decompression |
| `internal/storage` | Local file/chunk storage and metadata index |
| `internal/session` | Parse session lifecycle and session-scoped query access |
| `internal/parser` | Parser registry, format parsers, DuckStore, and map/rules parsers |
| `internal/config` | XML config parsing for `PLCLogVisualizer.exe.config` |
| `internal/web` | Embedded static frontend serving |

## Active API Groups

Configured in `cmd/server/main.go`:
- `/api/health`
- `/api/ws/uploads`
- `/api/files/*`
- `/api/parse/:sessionId/*`
- `/api/map/*`
- `/api/config/validation-rules`

See [../API.md](../API.md) for the full route table.

## Local Run

```bash
cd backend
go run cmd/server/main.go
```

`go run` resolves `PLCLogVisualizer.exe.config` relative to the temporary executable returned by `os.Executable()`, not the checked-in `backend/config/PLCLogVisualizer.exe.config`. Use a built binary with the XML placed beside it when you need a stable config file location.

## Tests

```bash
cd backend
go test ./...
```

## Notes

- Session cleanup runs in a background goroutine.
- Large parse sessions use DuckDB-backed storage for memory-efficient querying.
- File deletion is config-gated through `AllowFileDeletion`.

## Current XLSX Support

The parser registry already includes live XLSX parsers for:
- STK PLC observable exports (`stk_plc`)
- STK Transfer exports (`stk_transfer`)

Other spreadsheet layouts still need explicit parser work.

## Related Docs

- [../README.md](../README.md)
- [../API.md](../API.md)
- [./UPLOAD_HANDLING.md](./UPLOAD_HANDLING.md)
- [./STORAGE.md](./STORAGE.md)
- [../BUILD_AIRGAPPED.md](../BUILD_AIRGAPPED.md)
