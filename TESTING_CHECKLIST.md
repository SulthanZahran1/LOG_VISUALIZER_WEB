# Testing Checklist

Use this for functional verification after code changes.

## 1) Required Automated Checks

Frontend:
```bash
cd frontend
npm run typecheck
npm run lint
npm run test
```

Run E2E for UI/interaction changes:
```bash
cd frontend
npm run test:e2e
```

Backend:
```bash
cd backend
go test ./...
```

## 2) Smoke Test (Manual)

1. Start app (`make dev`)
2. Upload a sample log (PLC or CSV)
3. Parse completes and session becomes usable
4. Log table shows rows; sorting/search works
5. Waveform opens and renders selected signals
6. Map opens (if map/rules configured) without runtime errors

## 3) Feature Area Checklist

### Upload
- Single upload works
- Chunked upload works for larger files
- Recent files list updates

### Parse + Log Table
- Parse status/progress updates
- Filtering/sorting works
- Pagination/virtualization behaves correctly

### Waveform
- Zoom/pan interaction works
- Data refresh respects time range
- Boundary continuity is visually correct at viewport edges

### Map + Carrier
- Map layout loads
- Rules load and affect coloring
- Carrier log loads and entries render

### Multi-file Flow
- Multi-file parse/merge starts and completes
- Results are viewable in log/waveform

## 4) Regression Focus

Prioritize these when related code changed:
- API contract changes (`API.md` + `frontend/src/api/client.ts`)
- Store state transitions (`stores/log`, `stores/waveform`, `stores/map`)
- Upload protocol behavior (`/api/files/*` and `/api/ws/uploads`)

## 5) Useful Commands

```bash
# full frontend pipeline
cd frontend && npm run test:all

# targeted e2e
cd frontend && npm run test:e2e -- log-table-filtering.spec.ts
```
