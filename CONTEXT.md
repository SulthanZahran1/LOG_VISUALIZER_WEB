# CONTEXT.md — Session Context

> Paste this into each AI session. Update after each work session.
> Last updated: 2026-01-13

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
| Communication | REST API |
| Browser | Chrome only |

## Repository Structure

```
/web_version
├── AGENTS.md              ← AI guidelines (read this)
├── CONTEXT.md             ← You are here
├── TESTING_CHECKLIST.md   ← Manual test cases
├── .agent/
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
│   │   ├── styles/        ← CSS files
│   │   └── utils/         ← Utilities
│   ├── package.json
│   └── vite.config.ts
└── Makefile
```

---

## Current Phase

## Current Phase

**Phase: 2 — Waveform/Timing Diagram + Filtering (In Progress)**

Core Waveform Canvas and signal rendering are implemented. Next: Advanced interaction (time axis labels, precise cursor) and filtering.

---

## What's Done

- [x] Migration spec created (see `/.gemini/.../web_migration_spec.md`)
- [x] AI guidelines defined (`AGENTS.md`)
- [x] Context defined (`CONTEXT.md`)
- [x] Testing checklist created (`TESTING_CHECKLIST.md`)
- [x] Agent scratchpad structure defined (`/.agent/`)
- [x] Backend scaffolded (Go module, Echo server, models)
- [x] Frontend scaffolded (Vite+Preact, theme, types, API client)
- [x] Makefile created
- [x] Backend storage manager implemented
- [x] File upload and management API implemented
- [x] File upload and recent files UI components implemented
- [x] Log parsers ported from Python to Go (PLC, MCS, CSV)
- [x] Parser auto-detection/registry implemented

---

## What's Next

1. Implement Time Axis labels and ticks
2. Refine Waveform interaction (cursor readout, sticky selection)
3. Implement Signal Filtering (regex, type) for Waveform
4. Add "Jump to Time" controls

---

## Development Phases

| Phase | Features | Status |
|:-----:|----------|:------:|
| 1 | File upload, recent files, Log Table, session persistence | Completed ✅ |
| 2 | Waveform/Timing Diagram, Signal Filtering | In Progress |
| 3 | Multi-View Split Panes, Tab management | Not started |
| 4 | Map Viewer, Carrier Tracking | Not started |
| 4.5 | Playback Feature (time scrubbing, play/pause) | Not started |
| 5 | Bookmarks, Time Synchronization | Not started |
| 5.5 | Multi-File Merge | Not started |
| 6 | Signal Validation, YAML Rule Editor | Not started |

---

## Key Files to Reference

| When working on... | Reference... |
|--------------------|--------------| 
| Any task | `AGENTS.md` (conventions) |
| Architecture/types | `AGENTS.md` "Key Types Reference" section |
| Testing | `TESTING_CHECKLIST.md` |
| Current tasks | `/.agent/TODO.md` |
| Desktop reference | `../plc_to_wavedrom/CONTEXT.md` |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload log file (1GB max) |
| GET | `/api/files/recent` | List 20 recent files |
| GET | `/api/files/:id` | Get file info |
| DELETE | `/api/files/:id` | Remove file |
| POST | `/api/parse` | Start parsing |
| GET | `/api/parse/:sessionId/status` | Parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/chunk` | Time-window chunk |
| GET | `/api/config/map` | Map YAML config |
| GET | `/api/config/validation-rules` | Validation rules |
| PUT | `/api/config/validation-rules` | Update rules |

---

## Resolved Decisions

| Decision | Resolution |
|----------|------------|
| Playback feature? | ✅ Yes, after Map Viewer (Phase 4.5) |
| Export features? | ❌ Not now, future consideration |
| WebSocket vs polling? | Polling (simpler for single-user) |
| Session persistence? | ✅ Yes, use IndexedDB |
| Multi-file merge? | ✅ Yes, after Playback (Phase 5.5) |

---

## Session Instructions

When starting a session:

1. Read `AGENTS.md` for project rules
2. Check `/.agent/TODO.md` for current tasks
3. Check `/.agent/SCRATCHPAD.md` for any blockers or notes from last session
4. Work on the next task
5. Update `/.agent/CHANGELOG.md` with what you did
6. Update `/.agent/TODO.md` to reflect progress
7. Update this file's "What's Done" and "What's Next" sections
