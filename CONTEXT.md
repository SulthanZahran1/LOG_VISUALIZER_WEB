# CONTEXT.md — Session Context

> Paste this into each AI session. Update after each work session.
> Last updated: 2026-01-15

---

## Project

**PLC Log Visualizer (Web)** — Web port of PySide6 desktop application for industrial PLC log analysis.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Go 1.21+ |
| Frontend | TypeScript + Preact + Signals + Vite |
| State | @preact/signals-core |
| Styling | CSS Variables (industrial dark theme) |
| Testing | Vitest + Playwright + ESLint |
| Communication | REST API |
| Browser | Chrome only |

## Repository Structure

```
/web_version
├── CONTEXT.md             ← You are here
├── TESTING_CHECKLIST.md   ← Automated + manual test cases
├── .agent/
│   ├── workflows/         ← Agent workflows (e.g., /testing)
│   ├── SCRATCHPAD.md      ← Current thinking, blockers
│   ├── CHANGELOG.md       ← What's been done
│   └── TODO.md            ← Task tracking
├── backend/
│   ├── cmd/server/        ← Entry point
│   ├── internal/
│   │   ├── models/        ← Domain types
│   │   ├── parser/        ← Log parsers (PLC, MCS, CSV)
│   │   ├── storage/       ← File store, chunk manager
│   │   ├── api/           ← REST handlers
│   │   └── validation/    ← Signal validators
│   ├── config/            ← YAML config files
│   └── testdata/          ← Test fixtures
├── frontend/
│   ├── src/
│   │   ├── components/    ← UI components by feature
│   │   ├── stores/        ← Signal-based stores
│   │   ├── api/           ← API client
│   │   ├── models/        ← TypeScript types
│   │   ├── test/          ← Test setup
│   │   └── utils/         ← Utilities
│   ├── e2e/               ← Playwright E2E tests
│   ├── vitest.config.ts   ← Unit test config
│   ├── playwright.config.ts ← E2E test config
│   ├── eslint.config.js   ← Linting config
│   ├── package.json
│   └── vite.config.ts
└── Makefile
```

---

## Testing Infrastructure

**Always run automated tests before browser agent testing!**

### Test Commands (from `frontend/`)

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm run typecheck` | TypeScript type checking | instant |
| `npm run lint` | ESLint code quality | ~2s |
| `npm run test` | Vitest unit tests | ~2s |
| `npm run test:e2e` | Playwright E2E tests | ~8s |
| `npm run test:all` | All of the above | ~15s |

### When to Use Each

1. **Unit Tests** → Pure functions, component logic, stores
2. **E2E Tests** → Page load, navigation, form submission
3. **Browser Agent** → Visual bugs, complex interactions (last resort)

Use `/testing` workflow before agentic browser testing.

---

## Current Phase

**Phase: 3 — Map Viewer + Carrier Tracking (In Progress)**

Phase 3 is currently in progress. The backend XML parser, API endpoints, and initial SVG-based map rendering are complete.

---

## What's Done

- [x] Migration spec created
- [x] Context and testing documentation
- [x] Backend scaffolded (Go module, Echo server, models)
- [x] Frontend scaffolded (Vite+Preact, types, API client)
- [x] Log parsers ported from Python to Go (PLC, MCS, CSV)
- [x] File upload/management API and UI (drag-drop, browse, chunked upload for 1GB+ files)
- [x] Log Table with virtual scroll, filtering, sorting
- [x] Waveform Canvas with signal rendering
- [x] UI/UX overhaul (unified dark industrial theme)
- [x] Testing infrastructure (Vitest, Playwright, ESLint)
- [x] Waveform Toolbar (Zoom, Pan, Fit, Presets)
- [x] Waveform Cursor (Hover line, Readout)
- [x] Click-drag panning (mouse drag to pan timeline)
- [x] Arrow key navigation (Left/Right to pan)
- [x] Jump to Time input (HH:MM:SS.mmm format)
- [x] Click axis to jump to time
- [x] Signal type filter (Boolean/String/Integer)
- [x] Value-based color coding for state signals
- [x] Time range selection (Shift + Drag)
- [x] Waveform Panning (Click-drag and mouse wheel)
- [x] Arrow key navigation (Left/Right to pan)
- [x] Jump to Time input (HH:MM:SS.mmm)
- [x] Signal Selector tree with search and regex
- [x] Tabbed View Management (replacing split panes)
- [x] "Show changed" filter for Waveform sidebar
- [x] Filter presets (save/load/delete)
- [x] Logarithmic zoom slider
- [x] Signal color-coding by device
- [x] Signal focus highlight
- [x] Right-click context menu for signals
- [x] Map Layout XML Parser (Go implementation)
- [x] Map Viewer API endpoints (Upload/Layout)
- [x] SVG-based Map Canvas with pan/zoom
- [x] Map object sub-components (Belt, Arrow, Label)
- [x] Map View integration into tabbed shell

---

## What's Next

1. Carrier Tracking (Mapping log data to map units)
2. Real-time Map Updates during log playback
3. Playback Feature (next sub-phase)

---

## Development Phases

| Phase | Features | Status |
|:-----:|----------|:------:|
| 2 | Waveform/Timing Diagram, Signal Filtering | Completed ✅ |
| 3 | Map Viewer, Carrier Tracking | In Progress 🚧 |
| 3.5 | Playback Feature (time scrubbing, play/pause) | Not started |
| 4 | Bookmarks, Time Synchronization | Not started |
| 4.5 | Multi-File Merge | Not started |
| 5 | Signal Validation, YAML Rule Editor | Not started |

---

## Key Files to Reference

| When working on... | Reference... |
|--------------------|--------------|
| Starting work | Run `/testing` workflow first |
| Architecture/types | `CONTEXT.md` types section |
| Testing | `TESTING_CHECKLIST.md`, `.agent/workflows/testing.md` |
| Current tasks | `.agent/TODO.md` |
| Desktop reference | `../plc_to_wavedrom/CONTEXT.md` |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload log file (regular single POST) |
| POST | `/api/files/upload/chunk` | Upload file chunk (5MB chunks) |
| POST | `/api/files/upload/complete` | Complete chunked upload |
| GET | `/api/files/recent` | List 20 recent files |
| GET | `/api/files/:id` | Get file info |
| DELETE | `/api/files/:id` | Remove file |
| POST | `/api/parse` | Start parsing |
| GET | `/api/parse/:sessionId/status` | Parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/chunk` | Time-window chunk |
| GET | `/api/parse/:sessionId/signals` | List all unique signals |
| GET | `/api/map/layout` | Get active map layout |
| POST | `/api/map/upload` | Upload new map layout |

---

## Session Instructions

When starting a session:

1. **Run tests first**: `cd frontend && npm run test:all`
2. Check `.agent/TODO.md` for current tasks
3. Check `.agent/SCRATCHPAD.md` for blockers
4. Work on the next task
5. Update `.agent/CHANGELOG.md` with what you did
6. Update `.agent/TODO.md` to reflect progress
7. Update this file's "What's Done" section
