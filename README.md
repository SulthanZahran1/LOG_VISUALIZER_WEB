# CIM Visualizer

Web app for analyzing PLC/AMHS logs with a synchronized log table, waveform view, and map view.

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
cd backend && go run cmd/server/main.go
cd frontend && npm run dev
```

### Production Build
```bash
make build
# or
docker-compose up --build
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

## Architecture (Current)

- Backend: Go + Echo + DuckDB-backed parsing/storage path for large PLC logs
- Frontend: Preact + `@preact/signals` + Vite
- Upload paths: HTTP chunked upload and WebSocket upload (`/api/ws/uploads`)
- Primary stores: modular `stores/log`, `stores/waveform`, `stores/map` with legacy re-export entrypoints preserved

## Documentation Map

- [AGENTS.md](./AGENTS.md): developer/agent working guide
- [CONTEXT.md](./CONTEXT.md): short session bootstrap checklist
- [API.md](./API.md): API surface and message contracts
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md): practical verification checklist
- [backend/README.md](./backend/README.md): backend architecture and package responsibilities
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md): upload pipeline details
- [backend/STORAGE.md](./backend/STORAGE.md): storage behavior and conventions
- [frontend/FRONTEND.md](./frontend/FRONTEND.md): frontend structure and store patterns
- [BUILD_AIRGAPPED.md](./BUILD_AIRGAPPED.md): standalone/offline build flow

## Source of Truth Policy

Documentation follows the current codebase. If docs disagree with code, code is authoritative and docs should be updated.
