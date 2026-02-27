---
name: cim-visualizer
description: |
  CIM Visualizer is a web-based PLC/AMHS log analysis tool.
  Use this skill for:
  - Go backend API and parser/session/storage changes
  - Preact frontend components/stores/API integration
  - Upload protocols (HTTP chunked + WebSocket)
  - Log table, waveform, map, and carrier-tracking behavior

  Current stack: Go 1.24, Echo v4, DuckDB, Preact 10, @preact/signals, Vite, Vitest, Playwright.
---

# CIM Visualizer Skill

## Source of Truth Rule

Treat the current codebase as authoritative.

When docs and code differ, trust and follow:
1. `backend/cmd/server/main.go` (active routes/middleware)
2. `frontend/src/api/client.ts` (frontend API contracts)
3. actual package/component/store structure on disk

## Current Architecture Snapshot

```text
backend/
  internal/
    api/        # handlers_upload/parse/map/carrier/health + websocket
    upload/     # async upload jobs
    session/    # parse sessions + cleanup
    parser/     # parser registry + duckstore
    storage/    # local file/chunk storage

frontend/src/
  api/          # request wrappers + upload/ws helpers
  components/   # file, log, waveform, map, settings, transition
  stores/
    log/
    waveform/
    map/
    logStore.ts      # legacy re-export
    waveformStore.ts # legacy re-export
    mapStore.ts      # legacy re-export
  views/
```

## API Development Workflow

For backend endpoint changes:
1. Update handler implementation in `backend/internal/api/handlers_*.go`
2. Register/adjust route in `backend/cmd/server/main.go`
3. Update frontend client wrappers in `frontend/src/api/client.ts`
4. Add or update tests (Go and/or frontend)
5. Update docs (`API.md`) if behavior or contracts changed

## Frontend Store Workflow

Use modular stores for new work:
- `stores/log/*`
- `stores/waveform/*`
- `stores/map/*`

Patterns:
- `state.ts`: signals/computed
- `actions.ts`: mutations + async flows
- `effects.ts`: side effects
- `types.ts`: typed contracts
- `index.ts`: public exports

Keep legacy top-level store entrypoints compatible unless the task explicitly removes them.

## Upload/Parsing Notes

- Uploads support HTTP and WebSocket flows.
- Large parse sessions can use DuckDB-backed query paths.
- Waveform rendering depends on chunk + boundary APIs.
- Map state combines layout, rule mapping, and optional carrier log stream/data.

## Test Commands

Frontend:
```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

Backend:
```bash
cd backend
go test ./...
```
