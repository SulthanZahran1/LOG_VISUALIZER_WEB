# AGENTS.md — AI Assistant Guidelines

> This file defines rules and conventions for AI assistants working on this project.
> Cursor, Claude, Copilot, and similar tools should follow these guidelines.

---

## Project Overview

**PLC Log Visualizer (Web)** — Web port of the PySide6 desktop application for parsing, visualizing, and analyzing industrial PLC logs.

- **Backend**: Go 1.21+
- **Frontend**: TypeScript + Preact/Signals + Vite
- **Communication**: REST API
- **Design Document**: See `CONTEXT.md` for architecture, `TESTING_CHECKLIST.md` for verification

---

## Code Conventions

### Go (Backend)

**Error Handling**
- Return errors, let caller handle
- Wrap errors with context: `fmt.Errorf("parsing file: %w", err)`
- Never silently ignore errors

**Naming**
- Follow standard Go conventions
- PascalCase for exported, camelCase for internal
- Handlers: `HandleUploadFile`, `HandleParseLog`
- Interfaces: `-er` suffix where sensible (`Parser`, `ChunkManager`)

**Comments**
- Godoc comment on all exported functions, types, and methods
- Explain *why*, not *what*
- Mark incomplete work with `// TODO:`

**Structure**
- Business logic lives in service functions, not in types
- Types are data containers with minimal methods
- Packages communicate via interfaces for testability

**Dependencies**
- Do not add external dependencies without explicit approval
- Prefer standard library where reasonable

### TypeScript (Frontend)

**Components**
- Functional components with Preact
- Signals (`@preact/signals-core`) for all reactive state
- No class components

**Naming**
- Components: PascalCase (`LogTable.ts`, `WaveformCanvas.ts`)
- Stores: `xxxStore.ts` (`sessionStore.ts`, `viewportStore.ts`)
- Utilities: camelCase (`formatTimestamp.ts`)

**Styling**
- CSS Variables for theming (`theme.css`)
- Industrial dark theme
- No CSS frameworks (no Tailwind)

**File Structure**
```
frontend/src/
  /api           → API client functions
  /components    → UI components by feature
    /file        → FileUpload, RecentFiles
    /table       → LogTable, VirtualScroll
    /waveform    → Canvas rendering components
    /map         → MapViewer, CarrierTracker
    /layout      → SplitPaneManager, TabBar
    /filter      → SignalFilter, FilterPresets
    /bookmarks   → BookmarkDialog, BookmarkMarker
  /stores        → Signal-based stores
  /models        → TypeScript type definitions
  /styles        → CSS files
  /utils         → Pure utility functions
```

---

## Architecture Rules

**Dependency Direction**
```
api (handlers) → services → models
                    ↓
              storage (files, chunks)
```

- Models (`/internal/models`) depend on nothing
- Services (`/internal/parser`, `/internal/storage`) depend on models
- API handlers depend on services
- Never import upward

**Package Boundaries**
- `parser` package must not import `storage`
- `storage` imports parser results, not parser logic
- `api` orchestrates between parser and storage

---

## Testing

**Philosophy**
- Unit test critical logic (parsing, chunking, filtering)
- Skip trivial tests (simple getters, struct construction)
- Prefer integration tests for API endpoints
- Tests live next to code: `foo.go` → `foo_test.go`

**Test Data**
- Use `testdata/` folder for fixtures
- Never generate mock data inline in tests
- JSON fixtures for log samples, plant configs

---

## AI-Specific Instructions

### Do NOT

- ❌ Generate mock data inline — use `testdata/` files
- ❌ Rewrite existing code unless explicitly asked
- ❌ Add dependencies without asking
- ❌ Skip error handling for brevity
- ❌ Use `any` type in TypeScript (use `unknown` + narrowing if needed)
- ❌ Create files outside the established structure without asking

### ALWAYS

- ✅ Handle errors explicitly
- ✅ Add `// TODO:` comments for incomplete implementations
- ✅ Use types from `/internal/models` (Go) or `/src/models` (TS)
- ✅ Update `/.agent/SCRATCHPAD.md` with current thinking and blockers
- ✅ Append to `/.agent/CHANGELOG.md` after completing tasks
- ✅ Check off items in `/.agent/TODO.md` when done
- ✅ Reference `CONTEXT.md` for architectural decisions

### Communication

Use the `/.agent/` folder as a scratchpad and communication channel:

| File | Purpose |
|------|---------|
| `SCRATCHPAD.md` | Current thinking, questions, blockers, notes |
| `CHANGELOG.md` | Append-only log of what was done |
| `TODO.md` | Task tracking, check off when complete |

Update these files during and after work. The human will read them to understand progress.

---

## Key Types Reference

> These are the canonical types. Always use them. Do not redefine.

### Go (`/internal/models/`)

```go
// log_entry.go
type SignalType string

const (
    SignalTypeBoolean SignalType = "boolean"
    SignalTypeString  SignalType = "string"
    SignalTypeInteger SignalType = "integer"
)

type LogEntry struct {
    DeviceID   string      `json:"deviceId"`
    SignalName string      `json:"signalName"`
    Timestamp  time.Time   `json:"timestamp"`
    Value      interface{} `json:"value"` // bool, string, or int
    SignalType SignalType  `json:"signalType"`
}
```

```go
// parsed_log.go
type ParsedLog struct {
    Entries   []LogEntry          `json:"entries"`
    Signals   map[string]struct{} `json:"signals"`
    Devices   map[string]struct{} `json:"devices"`
    TimeRange *TimeRange          `json:"timeRange,omitempty"`
}

type TimeRange struct {
    Start time.Time `json:"start"`
    End   time.Time `json:"end"`
}
```

```go
// session.go
type SessionStatus string

const (
    SessionStatusPending  SessionStatus = "pending"
    SessionStatusParsing  SessionStatus = "parsing"
    SessionStatusComplete SessionStatus = "complete"
    SessionStatusError    SessionStatus = "error"
)

type ParseSession struct {
    ID              string        `json:"id"`
    FileID          string        `json:"fileId"`
    Status          SessionStatus `json:"status"`
    Progress        float64       `json:"progress"` // 0-100
    EntryCount      int           `json:"entryCount,omitempty"`
    SignalCount     int           `json:"signalCount,omitempty"`
    ProcessingTimeMs int64        `json:"processingTimeMs,omitempty"`
    Errors          []ParseError  `json:"errors,omitempty"`
}

type ParseError struct {
    Line    int    `json:"line"`
    Content string `json:"content"`
    Reason  string `json:"reason"`
}
```

### TypeScript (`/src/models/types.ts`)

Mirror the Go types. Keep them in sync manually.

```typescript
type SignalType = 'boolean' | 'string' | 'integer';

interface LogEntry {
  deviceId: string;
  signalName: string;
  timestamp: number;  // Unix ms
  value: boolean | string | number;
  signalType: SignalType;
}

interface ParsedLog {
  entries: LogEntry[];
  signals: Set<string>;
  devices: Set<string>;
  timeRange: { start: number; end: number } | null;
}

type SessionStatus = 'pending' | 'parsing' | 'complete' | 'error';

interface ParseSession {
  id: string;
  fileId: string;
  status: SessionStatus;
  progress: number;
  entryCount?: number;
  signalCount?: number;
  processingTimeMs?: number;
  errors?: ParseError[];
}
```

---

## Decisions Log

Record architectural decisions here as they're made.

| ID | Decision | Rationale |
|----|----------|-----------|
| D001 | Canvas for waveform rendering | Good perf for scrolling, minimal repaint on pan/zoom |
| D002 | Virtual scrolling for table | Handle 100k+ rows without DOM bloat |
| D003 | Server-side parsing only | Files up to 1GB, Go handles better than browser |
| D004 | Signals for state management | Fine-grained reactivity, minimal re-renders |
| D005 | No mobile support | Industrial use, desktop-only, Chrome target |
| D006 | Industrial dark theme | Matches desktop app, reduces eye strain |
| D007 | Polling over WebSocket | Simpler for single-user, sufficient for parse progress |
| D008 | IndexedDB for session persistence | localStorage 5MB limit insufficient for parsed data |
| D009 | Playback after Map Viewer (Phase 4.5) | Core viewing before advanced features |
| D010 | Multi-file merge after Playback (Phase 5.5) | Nice-to-have, not blocking core workflow |
| D011 | No export features initially | Can add later, not blocking MVP |

---

## Getting Unstuck

If unclear on how to proceed:

1. Check `CONTEXT.md` for current phase and architecture
2. Check the decisions log above
3. Write your question in `/.agent/SCRATCHPAD.md`
4. Ask the human rather than guessing on architecture
