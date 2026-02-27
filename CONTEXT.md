# CONTEXT.md — Session Bootstrap

Last updated: 2026-02-27

## First 5 Steps

1. Confirm baseline health:
   - `cd frontend && npm run test:all` (or at least typecheck/lint/unit)
2. Check active work notes:
   - `.agent/TODO.md`
   - `.agent/SCRATCHPAD.md`
3. Read relevant docs only:
   - `API.md`, `frontend/FRONTEND.md`, `backend/README.md`
4. Implement focused change(s).
5. Update docs/changelog if behavior changed.

## Current Architecture Snapshot

- Backend: Echo API with modular handlers (`internal/api/handlers_*.go`), upload manager, session manager, DuckDB-backed parse storage for large PLC logs.
- Frontend: Preact + Signals with modular stores:
  - `src/stores/log/*`
  - `src/stores/waveform/*`
  - `src/stores/map/*`
  - Legacy compatibility entrypoints still exist in `logStore.ts`, `waveformStore.ts`, `mapStore.ts`.
- Upload protocols:
  - HTTP chunked upload endpoints
  - WebSocket upload protocol (`/api/ws/uploads`)

## Test Hierarchy

1. Type check
2. Lint
3. Unit tests
4. E2E tests

Commands:
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

## Reference Docs

- [README.md](./README.md)
- [API.md](./API.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [backend/README.md](./backend/README.md)
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)
- [backend/STORAGE.md](./backend/STORAGE.md)
