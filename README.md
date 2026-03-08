# CIM Visualizer

Last updated: 2026-03-08

Web app for analyzing PLC/AMHS logs across synchronized log-table, waveform, map, transition, and transfer-heatmap views.

## Quick Start

### Prerequisites
- Go 1.24+
- Node.js 20+
- npm

### Development
```bash
make dev
# backend: http://localhost:8089
# frontend: http://localhost:5173
```

Run separately:
```bash
cd backend
go run cmd/server/main.go

cd frontend
npm run dev
```

Local backend dev uses `go run`, so XML config is created/read next to the temporary Go binary. See [backend/README.md](./backend/README.md) for the config-location caveat.

### Production Build
```bash
make build
# or
docker compose up --build
```

## Testing

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

## Current Snapshot

- Backend: Go + Echo + DuckDB-backed parsing/storage for large datasets
- Frontend: Preact + `@preact/signals` + Vite
- Supported inputs: PLC debug, tab-separated PLC, CSV signal, observable, MCS/carrier, TRS, and STK XLSX exports
- Main views: Log Table, Timing Diagram, Map Viewer, Transitions, Transfer Heatmap
- Upload paths: HTTP upload/chunking plus WebSocket upload at `/api/ws/uploads`
- State model: modular `stores/log`, `stores/waveform`, `stores/map` plus standalone auxiliary stores

## Documentation Map

- [AGENTS.md](./AGENTS.md): developer/agent guide and active doc list
- [CONTEXT.md](./CONTEXT.md): short session bootstrap checklist
- [API.md](./API.md): route table and client coverage notes
- [backend/README.md](./backend/README.md): backend architecture and runtime notes
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md): upload pipeline details
- [backend/STORAGE.md](./backend/STORAGE.md): storage behavior and filesystem layout
- [frontend/FRONTEND.md](./frontend/FRONTEND.md): frontend structure and store model
- [frontend/e2e/README.md](./frontend/e2e/README.md): Playwright workflow and fixtures
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md): verification checklist
- [BUILD_AIRGAPPED.md](./BUILD_AIRGAPPED.md): offline packaging flow

## Source of Truth

Documentation follows the current codebase. If docs and code differ, trust the code and update the closest source-specific doc.
