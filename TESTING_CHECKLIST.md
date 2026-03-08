# Testing Checklist

Last updated: 2026-03-08

Use this for functional verification after code changes.

## 1) Required Automated Checks

Frontend:
```bash
cd frontend
npm run typecheck
npm run lint
npm run test
```

Run E2E for UI or interaction changes:
```bash
cd frontend
npm run test:e2e
```

Backend:
```bash
cd backend
go test ./...
```

## 2) Smoke Test

1. Start the app with `make dev`.
2. Upload a sample log.
3. Confirm parse completion and usable session state.
4. Check log-table rows, search, and sorting.
5. Open waveform and verify selected signals render.
6. Open map view and verify layout/rules load cleanly.
7. Open transitions or heatmap when the session type supports them.

## 3) Feature Area Checklist

### Upload
- Single upload works
- Chunked upload works for larger files
- Recent files list updates

### Parse + Log Table
- Parse status/progress updates
- Filtering and sorting work
- Pagination or virtualization behaves correctly

### Waveform
- Zoom and pan work
- Data refresh respects the requested time range
- Boundary continuity is correct at viewport edges

### Map + Carrier
- Map layout loads
- Rules load and affect coloring
- Carrier log loads and entries render

### Transitions + Heatmap
- Transition query completes for the active session
- Transition results render with expected status buckets
- Transfer heatmap loads TRS-style data without client errors

### Multi-file Flow
- Multi-file parse/merge starts and completes
- Results remain viewable in the log table and waveform

## 4) Regression Focus

Prioritize these when related code changed:
- API contracts (`API.md` and `frontend/src/api/client.ts`)
- Core stores (`stores/log`, `stores/waveform`, `stores/map`) and `transitionStore.ts`
- Upload protocol behavior (`/api/files/*` and `/api/ws/uploads`)
- Playwright coverage under `frontend/e2e/*`

## 5) Useful Commands

```bash
# full frontend pipeline
cd frontend && npm run test:all

# targeted e2e
cd frontend && npm run test:e2e -- log-table-filtering.spec.ts
```

## Related Docs

- [README.md](./README.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [frontend/e2e/README.md](./frontend/e2e/README.md)
- [frontend/e2e/LOG_TABLE_TESTING.md](./frontend/e2e/LOG_TABLE_TESTING.md)
