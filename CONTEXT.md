# CONTEXT.md — Session Bootstrap

Last updated: 2026-03-08

## First 5 Steps

1. Confirm baseline health with `cd frontend && npm run test:all`, or at minimum run typecheck, lint, and unit tests.
2. Check active work notes in `.agent/TODO.md` and `.agent/USER_SPEC.md`.
3. Read only the closest docs you need: [README.md](./README.md), [API.md](./API.md), [backend/README.md](./backend/README.md), [frontend/FRONTEND.md](./frontend/FRONTEND.md).
4. Make the focused change.
5. Update the closest doc and [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) if behavior or verification flow changed.

## Current Snapshot

- Backend: Echo API with modular handlers under `backend/internal/api`, upload/session managers, and DuckDB-backed query paths for large parse sessions.
- Frontend: Preact + Signals with modular `stores/log`, `stores/waveform`, and `stores/map`, plus standalone auxiliary stores such as `transitionStore.ts`.
- Active views: Home, Log Table, Timing Diagram, Map Viewer, Transitions, Transfer Heatmap.
- Upload protocols: HTTP upload/chunking plus WebSocket upload at `/api/ws/uploads`.

## Test Order

1. Type check
2. Lint
3. Unit tests
4. E2E tests

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

## Related Docs

- [README.md](./README.md)
- [API.md](./API.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [backend/README.md](./backend/README.md)
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)
- [backend/STORAGE.md](./backend/STORAGE.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [frontend/e2e/README.md](./frontend/e2e/README.md)
