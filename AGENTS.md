# CIM Visualizer — Developer + Agent Guide

Last updated: 2026-02-27

## Project Summary

CIM Visualizer is a Chrome-targeted web application for PLC/AMHS log analysis.

Core capabilities:
- Multi-format log parsing (PLC debug, MCS/AMHS, CSV, tab)
- Large-file upload/parsing workflows (chunked upload, DuckDB path)
- Log table with filtering/sorting/selection
- Waveform/timing diagram rendering
- Map view with rules + carrier tracking
- Multi-file parse/merge workflow

## Source of Truth

The codebase is authoritative. Keep docs aligned to current implementation in:
- `backend/cmd/server/main.go` for active routes and middleware
- `frontend/src/api/client.ts` for frontend API usage
- actual folder structure under `backend/internal` and `frontend/src`

## Repo Layout (Condensed)

```text
.
├── backend/
│   ├── cmd/server/main.go
│   └── internal/
│       ├── api/        # modular handlers + websocket
│       ├── parser/     # parsers + duckstore
│       ├── session/    # parse session lifecycle
│       ├── storage/    # local file/chunk storage
│       └── upload/     # async upload processing jobs
├── frontend/
│   ├── src/api/
│   ├── src/components/
│   ├── src/stores/     # modular stores + legacy entrypoints
│   ├── src/views/
│   └── e2e/
├── API.md
├── CONTEXT.md
├── TESTING_CHECKLIST.md
└── BUILD_AIRGAPPED.md
```

## Local Dev Commands

```bash
make dev
make build
make clean
```

Frontend direct:
```bash
cd frontend
npm run dev
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

Backend direct:
```bash
cd backend
go run cmd/server/main.go
go test ./...
```

## Working Rules

- Keep backend and frontend types/contracts in sync.
- Prefer adding tests alongside behavior changes.
- Preserve backward compatibility when touching legacy entrypoints (`logStore.ts`, `mapStore.ts`, `waveformStore.ts`) unless intentionally removing them.
- For API changes: update route registration, handlers, client, and docs together.

## API Areas

- Health: `/api/health`
- Files/upload: `/api/files/*` + `/api/ws/uploads`
- Parse sessions: `/api/parse/:sessionId/*`
- Map/rules: `/api/map/*`
- Validation config: `/api/config/validation-rules`

See [API.md](./API.md) for the current endpoint table.

## Documentation Set

Active docs:
- [README.md](./README.md)
- [CONTEXT.md](./CONTEXT.md)
- [API.md](./API.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [backend/README.md](./backend/README.md)
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)
- [backend/STORAGE.md](./backend/STORAGE.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [BUILD_AIRGAPPED.md](./BUILD_AIRGAPPED.md)

Legacy refactoring planning docs were removed.
