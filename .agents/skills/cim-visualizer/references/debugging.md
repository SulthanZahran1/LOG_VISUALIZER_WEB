# Debugging Reference

## Backend

- Start from request path and handler (`backend/cmd/server/main.go` + `internal/api/handlers_*.go`).
- Trace parse/session state via `internal/session/manager.go`.
- For query issues, inspect `internal/parser/duckstore.go` and log SQL + args.

## Frontend

- Verify API wrapper usage in `frontend/src/api/client.ts`.
- Inspect signal state from modular stores (`stores/log`, `stores/waveform`, `stores/map`).
- For rendering issues, isolate whether data load, store state, or component render path failed.

## Quick Checks

- No data in table: validate current session + `/parse/:id/entries` responses.
- Waveform gaps: check `/chunk` + `/chunk-boundaries` request/response.
- Map not coloring: verify map rules loaded and signal updates applied.
