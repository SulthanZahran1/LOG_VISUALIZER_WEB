# CHANGELOG.md — What's Been Done

> Append-only log. Add entries at the top as work is completed.
> Format: `## YYYY-MM-DD: Summary`

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
