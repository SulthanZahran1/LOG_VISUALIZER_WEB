# CONTEXT.md — Session Context

> Paste this into each AI session. Last updated: 2026-02-13

---

## Quick Start

1. **Run tests first**: `cd frontend && npm run test:all`
2. **Check active tasks**: [TODO.md](.agent/TODO.md)
3. **Check blockers**: [SCRATCHPAD.md](.agent/SCRATCHPAD.md)
4. **Use workflow**: `/testing` before browser agent

---

## Session Instructions

When starting a session:

1. Run `cd frontend && npm run test:all` to verify codebase health
2. Check `.agent/TODO.md` for current tasks
3. Check `.agent/SCRATCHPAD.md` for blockers or context
4. Work on the next task
5. Update `.agent/CHANGELOG.md` with completed work
6. Update `.agent/TODO.md` to reflect progress
7. **Update `.agent/architecture/` if adding new systems, data flows, or significant features.**

---

## Project

**CIM Visualizer** — Web-based industrial PLC log analysis for semiconductor manufacturing (AMHS).

| Layer | Technology |
|-------|------------|
| Backend | Go 1.21+ (Echo v4) |
| Frontend | TypeScript + Preact + Signals + Vite |
| Styling | CSS Variables (industrial dark theme) |
| Testing | Vitest + Playwright + ESLint |
| Browser | Chrome only |

---

## Repository Structure

```
/web_version
├── CONTEXT.md             ← You are here
├── TESTING_CHECKLIST.md   ← Test cases
├── .agent/
│   ├── architecture/      ← Architecture diagrams
│   ├── workflows/         ← Agent workflows
│   ├── SCRATCHPAD.md      ← Current thinking, blockers
│   ├── CHANGELOG.md       ← What's been done
│   └── TODO.md            ← Task tracking
├── backend/
│   ├── cmd/server/        ← Entry point
│   ├── internal/
│   │   ├── models/        ← Domain types
│   │   ├── parser/        ← Log parsers
│   │   ├── storage/       ← File store
│   │   ├── api/           ← REST handlers
│   │   └── validation/    ← Validators
│   └── config/            ← YAML configs
└── frontend/
    ├── src/
    │   ├── components/    ← UI components (file, log, waveform, map, layout, settings, transition)
    │   ├── stores/        ← Signal stores
    │   ├── api/           ← API client
    │   └── models/        ← TypeScript types
    ├── e2e/               ← Playwright tests
    └── package.json
```

---

## Project Status

**Active Development** — Core features implemented: upload, parsing, log table, waveform visualization with virtualization, map viewer with carrier tracking, multi-file merge, customizable color coding, DuckDB storage for large files.

See [TODO.md](.agent/TODO.md) for current tasks and [CHANGELOG.md](.agent/CHANGELOG.md) for recent changes.

---

## Architecture Documentation

Detailed architecture diagrams are in [.agent/architecture/](.agent/architecture/):

| Document | Contents |
|----------|----------|
| [system-overview.md](.agent/architecture/system-overview.md) | Component, frontend, backend architecture |
| [data-flow.md](.agent/architecture/data-flow.md) | Upload, parsing, retrieval, sync flows |
| [map-dual-log.md](.agent/architecture/map-dual-log.md) | Map Viewer dual log system (active) |
| [parser-architecture.md](.agent/architecture/parser-architecture.md) | Log format detection and parsing |
| [state-management.md](.agent/architecture/state-management.md) | Preact Signals store patterns |

## Deep-Dive Documentation

| Document | What It Covers |
|----------|----------------|
| **[API.md](./API.md)** | REST API endpoints, upload protocol, WebSocket, compression |
| **[frontend/FRONTEND.md](./frontend/FRONTEND.md)** | Frontend components, stores, API client |
| **[backend/README.md](./backend/README.md)** | Backend architecture, packages, DuckDB |
| **[backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)** | Chunked upload pipeline, streaming decompression |
| **[backend/STORAGE.md](./backend/STORAGE.md)** | File storage, chunk assembly, thread safety |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload log file |
| POST | `/api/files/upload/chunk` | Upload chunk (5MB) |
| POST | `/api/files/upload/complete` | Complete chunked upload |
| WS | `/api/ws/uploads` | WebSocket upload endpoint |
| GET | `/api/files/recent` | List recent files |
| GET | `/api/files/:id` | Get file info |
| DELETE | `/api/files/:id` | Delete file |
| PUT | `/api/files/:id` | Rename file |
| POST | `/api/parse` | Start parsing (single or merged) |
| GET | `/api/parse/:sessionId/status` | Parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/chunk` | Time-window chunk |
| GET | `/api/parse/:sessionId/signals` | List signals |
| GET | `/api/parse/:sessionId/categories` | List categories |
| GET | `/api/parse/:sessionId/stream` | SSE stream entries |
| POST | `/api/parse/:sessionId/keepalive` | Keep session alive |
| GET | `/api/map/layout` | Get map layout |
| POST | `/api/map/upload` | Upload map layout |
| GET/POST | `/api/map/rules` | Map rules (YAML) |
| GET | `/api/map/files/recent` | Recent map files |
| GET | `/api/map/defaults` | List default maps |
| POST | `/api/map/defaults/load` | Load default map |
| POST | `/api/map/carrier-log` | Upload carrier log |
| GET | `/api/map/carrier-log` | Get carrier log info |
| GET | `/api/map/carrier-log/entries` | Carrier positions |

---

## Testing

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm run typecheck` | Type checking | instant |
| `npm run lint` | ESLint | ~2s |
| `npm run test` | Unit tests | ~2s |
| `npm run test:e2e` | E2E tests | ~8s |
| `npm run test:all` | All of above | ~15s |

**Test hierarchy**: TypeCheck → Lint → Unit → E2E → Browser Agent (last resort)

---

## Key References

| When working on... | Reference... |
|--------------------|--------------|
| Desktop reference | `../plc_to_wavedrom/CONTEXT.md` |
| Test cases | `TESTING_CHECKLIST.md` |
| Task status | `.agent/TODO.md` |
| Recent changes | `.agent/CHANGELOG.md` |
