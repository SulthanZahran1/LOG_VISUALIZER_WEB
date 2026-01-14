# CHANGELOG.md — What's Been Done

> Append-only log. Add entries at the top as work is completed.
> Format: `## YYYY-MM-DD: Summary`

## 2026-01-14: Phase 2 — Waveform Canvas Implementation

- Implemented `WaveformCanvas` using HTML5 Canvas for high-performance signal visualization.
- Created `waveformStore` to manage viewport state (zoom, pan, time range) and signal selection.
- Added `SignalSidebar` for managing displayed signals.
- Integrated Waveform View into the `SplitPane` layout system.
- Added "Add to Waveform" context menu action in the Log Table.
- Implemented `BooleanRenderer` and `StateRenderer` for different signal types.
- Fixed backend API timestamp compatibility (ISO 8601 -> Unix ms) in frontend client.

---

## 2026-01-13: Phase 1 — Foundation + Log Table Complete ✅

- Finalized Log Table with virtual scrolling and fixed row heights.
- Implemented regex search, case-sensitivity, and "Show Changed Only" filters.
- Integrated flexible layout engine (Split Panes) and session-based tab navigation.
- Added IndexedDB persistence for log sessions and layout configuration.
- Verified all core log parsers (PLC Debug, PLC Tab, MCS, CSV) in Go.
- Implemented Help overlay and universal header.

---

## 2026-01-13: Log Parsers Implementation (Python -> Go)

- Implemented `Parser` interface and common utilities in `backend/internal/parser/parser.go`.
- Ported four major log parsers from the reference desktop application:
  - `PLCDebugParser`: Bracket-delimited PLC logs.
  - `PLCTabParser`: Tab-delimited PLC logs.
  - `MCSLogParser`: AMHS/MCS logs with dual-ID support and multi-entry lines.
  - `CSVSignalParser`: Simple CSV-formatted signal logs.
- Implemented `Registry` in `backend/internal/parser/registry.go` for auto-detection and sniffing of log formats.
- Verified all parsers with a comprehensive test suite (`backend/internal/parser/parser_test.go`).
- Optimized parsers with fast-path string splitting where applicable.

---

## 2026-01-13: Phase 1 Scaffold Complete

- Scaffolded Go backend (`backend/`)
  - Go module with Echo v4.11.4
  - Server on :8080 with CORS
  - Core model types (LogEntry, ParsedLog, ParseSession, FileInfo)
  - Placeholder API routes for files/parse
- Scaffolded Vite+Preact frontend (`frontend/`)
  - TypeScript types mirroring Go
  - Industrial dark theme CSS
  - API client with typed fetch
  - App shell with status indicator
- Created root Makefile (`make dev`)
- Verified both servers work and communicate

**Next**: Implement file upload and parser

---

## 2026-01-13: Project Documentation Setup

- Created `AGENTS.md` with AI assistant guidelines
- Created `CONTEXT.md` with session context and architecture
- Created `TESTING_CHECKLIST.md` with manual test cases
- Created `.agent/` folder structure:
  - `TODO.md` - Task tracking
  - `CHANGELOG.md` - This file
  - `SCRATCHPAD.md` - Notes and blockers
- Defined 6-phase development roadmap
- Documented key types (Go and TypeScript)
- Established code conventions

**Next**: Begin Phase 1 - Initialize Go module and frontend project
