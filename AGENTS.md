# AGENTS.md — AI Coding Agent Guide

> Documentation for AI coding agents working on the PLC Log Visualizer Web project.
> Last updated: 2026-02-02

---

## Project Overview

**PLC Log Visualizer (Web)** is a web-based application for analyzing industrial PLC (Programmable Logic Controller) log files. It is a web port of a PySide6 desktop application, designed for high-performance visualization of large log files (up to 1GB+).

### Key Features

- **Multi-format Log Parsing**: Supports PLC debug logs, MCS/AMHS logs, CSV, and PLC tab-separated formats
- **Log Table**: Virtual scrolling table with sorting, filtering, and multi-selection
- **Waveform/Timing Diagram**: Canvas-based signal visualization with zoom, pan, and time selection
- **Map Viewer**: SVG-based layout visualization with carrier tracking and playback
- **Multi-file Merge**: Select and merge multiple log files with fuzzy deduplication
- **Bookmarks**: Cross-view time bookmarks with keyboard shortcuts

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Backend | Go 1.21+ | High-performance server |
| Web Framework | Echo v4 | REST API framework |
| Frontend | Preact 10.x | Lightweight React alternative |
| State Management | @preact/signals | Reactive signals |
| Build Tool | Vite | Dev server & bundler |
| Styling | CSS Variables | Industrial dark theme |
| Testing | Vitest | Unit testing |
| E2E Testing | Playwright | Browser automation |
| Browser Target | Chrome only | Industrial environment |

---

## Repository Structure

```
/web_version
├── AGENTS.md              ← This file
├── CONTEXT.md             ← Session context and quick start
├── TESTING_CHECKLIST.md   ← Manual testing checklist
├── Makefile               ← Development commands
├── docker-compose.yml     ← Production deployment
├── mapping_and_rules.yaml ← Sample map configuration
│
├── .agent/                ← Agent workspace
│   ├── architecture/      ← Architecture documentation
│   ├── workflows/         ← Agent workflows
│   ├── SCRATCHPAD.md      ← Current thinking, blockers
│   ├── CHANGELOG.md       ← What's been done
│   ├── TODO.md            ← Task tracking
│   └── USER_SPEC.md       ← User requirements
│
├── backend/               ← Go backend
│   ├── cmd/server/        ← Entry point (main.go)
│   ├── internal/
│   │   ├── models/        ← Domain types (LogEntry, etc.)
│   │   ├── parser/        ← Log parsers (PLC, MCS, CSV)
│   │   ├── storage/       ← File storage manager
│   │   ├── session/       ← Parse session manager
│   │   ├── api/           ← HTTP handlers
│   │   └── validation/    ← Input validators
│   ├── config/            ← Configuration files
│   ├── data/              ← Data storage (uploads, defaults)
│   ├── testdata/          ← Test fixtures
│   ├── go.mod             ← Go module definition
│   └── Dockerfile         ← Backend container
│
├── frontend/              ← Preact frontend
│   ├── src/
│   │   ├── api/           ← API client (client.ts)
│   │   ├── models/        ← TypeScript types
│   │   ├── stores/        ← Signal-based stores
│   │   ├── components/    ← UI components
│   │   │   ├── file/      ← File upload, recent files
│   │   │   ├── log/       ← Log table
│   │   │   ├── waveform/  ← Waveform canvas, sidebar
│   │   │   ├── map/       ← Map canvas, controls
│   │   │   ├── layout/    ← Nav buttons, split pane
│   │   │   └── transition/← Transition analysis
│   │   ├── views/         ← Main views (Home, Map)
│   │   ├── utils/         ← Utilities (TimeAxis, etc.)
│   │   ├── test/          ← Test setup
│   │   ├── main.tsx       ← Entry point
│   │   └── app.tsx        ← Main app component
│   ├── e2e/               ← Playwright E2E tests
│   ├── public/            ← Static assets
│   ├── package.json       ← NPM dependencies
│   ├── tsconfig.json      ← TypeScript config
│   ├── vite.config.ts     ← Vite config
│   ├── vitest.config.ts   ← Vitest config
│   ├── eslint.config.js   ← ESLint config
│   ├── playwright.config.ts ← Playwright config
│   └── Dockerfile         ← Frontend container
│
└── uploads/               ← Upload storage (runtime)
```

---

## Build and Development Commands

### Prerequisites

- Go 1.21 or later
- Node.js 20 or later
- npm or compatible package manager

### Development (Local)

```bash
# Run both backend and frontend in parallel
make dev

# Or run separately
cd backend && go run cmd/server/main.go  # Backend on :8089
cd frontend && npm run dev               # Frontend on :5173
```

### Production Build

```bash
# Build all
make build

# Or with Docker
docker-compose up --build
```

### Cleaning

```bash
make clean  # Removes dist/, node_modules/
```

---

## Testing Commands

Always run tests before committing changes. The test hierarchy is:

```
TypeCheck → Lint → Unit Tests → E2E Tests → Browser Agent (last resort)
```

### Frontend Testing

```bash
cd frontend

# Run all tests
npm run test:all

# Individual test types
npm run typecheck      # TypeScript type checking (instant)
npm run lint           # ESLint (~2s)
npm run test           # Unit tests with Vitest (~2s)
npm run test:e2e       # E2E tests with Playwright (~10s)

# Development
npm run test:watch     # Watch mode for unit tests
npm run test:coverage  # Generate coverage report
```

### Backend Testing

```bash
cd backend

go test ./...          # Run all Go tests
go test -v ./...       # Verbose output
```

### Test Files Location

- **Unit tests**: `frontend/src/**/*.test.{ts,tsx}`
- **E2E tests**: `frontend/e2e/*.spec.ts`
- **Go tests**: `backend/internal/**/*_test.go`

---

## Code Style Guidelines

### TypeScript / Preact

- **Type Safety**: Enable strict TypeScript mode; avoid `any`
- **Component Structure**: Functional components with hooks
- **State Management**: Use `@preact/signals` for global state
- **CSS**: CSS variables for theming (industrial dark theme defined in `index.css`)
- **File Naming**: PascalCase for components, camelCase for utilities

### Go

- **Package Structure**: Clear separation: `models/`, `parser/`, `api/`, etc.
- **Error Handling**: Explicit error returns, no panics in handlers
- **Naming**: Exported types use PascalCase, unexported use camelCase
- **Comments**: Document all exported types and functions

### ESLint Rules

Key rules from `frontend/eslint.config.js`:

```javascript
// TypeScript
'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
'@typescript-eslint/no-explicit-any': 'warn'

// React Hooks
'react-hooks/rules-of-hooks': 'error'
'react-hooks/exhaustive-deps': 'warn'

// General
'no-console': ['warn', { allow: ['warn', 'error'] }]
```

---

## API Endpoints

### File Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload log file (<5MB) |
| POST | `/api/files/upload/chunk` | Upload chunk (5MB) |
| POST | `/api/files/upload/complete` | Complete chunked upload |
| GET | `/api/files/recent` | List recent files |
| GET | `/api/files/:id` | Get file info |
| DELETE | `/api/files/:id` | Delete file |
| PUT | `/api/files/:id` | Rename file |

### Parse Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/parse` | Start parsing (single or multi-file) |
| GET | `/api/parse/:sessionId/status` | Parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/chunk` | Time-window chunk |
| GET | `/api/parse/:sessionId/signals` | List signals |
| GET | `/api/parse/:sessionId/stream` | SSE stream entries |

### Map Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/map/layout` | Get map layout |
| POST | `/api/map/upload` | Upload map XML |
| GET/POST | `/api/map/rules` | Map rules (YAML) |
| GET | `/api/map/files/recent` | Recent XML/YAML files |
| GET | `/api/map/defaults` | List default maps |
| POST | `/api/map/defaults/load` | Load default map |
| POST | `/api/map/carrier-log` | Upload carrier log |
| GET | `/api/map/carrier-log/entries` | Carrier positions |

---

## Key Data Models

### LogEntry (Go)

```go
type LogEntry struct {
    DeviceID   string      `json:"deviceId"`
    SignalName string      `json:"signalName"`
    Timestamp  time.Time   `json:"timestamp"`
    Value      interface{} `json:"value"`      // bool, string, or int
    SignalType SignalType  `json:"signalType"`
    Category   string      `json:"category,omitempty"`
    SourceID   string      `json:"sourceId,omitempty"`
}
```

### LogEntry (TypeScript)

```typescript
interface LogEntry {
    deviceId: string;
    signalName: string;
    timestamp: number;  // Unix ms
    value: boolean | string | number;
    signalType: 'boolean' | 'string' | 'integer';
    category?: string;
}
```

---

## State Management

Uses Preact Signals for reactive state:

| Store | Purpose | Key Signals |
|-------|---------|-------------|
| `logStore` | Log table state | `entries`, `filters`, `selectedRows` |
| `waveformStore` | Waveform view | `viewport`, `signals`, `zoom` |
| `mapStore` | Map viewer | `layout`, `playbackTime`, `carriers` |
| `bookmarkStore` | Bookmarks | `bookmarks`, `syncEnabled` |
| `selectionStore` | Cross-view selection | `selectedSignal` |
| `transitionStore` | Transition analysis | `rules`, `stats` |

---

## Security Considerations

- **File Uploads**: Limited to 1GB via `middleware.BodyLimit("1G")`
- **CORS**: Configured for localhost dev server only
- **File Storage**: Local filesystem storage; no sanitization of filenames (trust environment)
- **No Authentication**: Single-user local application

---

## Deployment

### Docker Compose (Production)

```bash
docker-compose up -d
```

Services:
- **backend**: Port 8089
- **frontend**: Port 3000 (nginx reverse proxy)

### Ports

| Service | Dev | Production |
|---------|-----|------------|
| Backend | 8089 | 8089 |
| Frontend | 5173 | 80 (nginx) |

---

## Common Tasks

### Adding a New Log Parser

1. Create parser in `backend/internal/parser/<format>.go`
2. Implement `Parse(reader io.Reader) ([]models.LogEntry, error)`
3. Register in `registry.go`
4. Add tests in `<format>_test.go`

### Adding a New API Endpoint

1. Add handler in `backend/internal/api/handlers.go`
2. Register route in `cmd/server/main.go`
3. Add client function in `frontend/src/api/client.ts`
4. Update types in `frontend/src/models/types.ts`

### Adding a New Component

1. Create component in `frontend/src/components/<category>/`
2. Add tests: `<Component>.test.tsx` in same directory
3. Export from component index if needed

---

## Related Documentation

> **Looking for something specific?** Check these dedicated docs:

| Document | When to Reference |
|----------|-------------------|
| **[CONTEXT.md](./CONTEXT.md)** | Session startup, current project phase status, quick start commands, workflow instructions |
| **[TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)** | Manual testing procedures, phase-by-phase verification, performance benchmarks |
| **.agent/TODO.md** | Current active tasks and what's being worked on right now |
| **.agent/CHANGELOG.md** | History of completed changes and recent modifications |
| **.agent/SCRATCHPAD.md** | Current blockers, questions, thinking process, temporary notes |
| **.agent/architecture/** | System design docs, data flows, architecture decisions |

### Quick Reference Guide

**Starting a new session?** → Read [CONTEXT.md](./CONTEXT.md) first  
**Need to verify functionality?** → Check [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)  
**Want to know current status?** → Check `.agent/TODO.md`  
**Seeing unexpected behavior?** → Check `.agent/CHANGELOG.md` for recent changes  
**Stuck on something?** → Write in `.agent/SCRATCHPAD.md`

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Add bookmark at current time |
| Ctrl+Shift+B | Toggle bookmark panel |
| Ctrl+] | Jump to next bookmark |
| Ctrl+[ | Jump to previous bookmark |

---

## Tips for AI Agents

1. **Always run tests first**: `cd frontend && npm run test:all`
2. **Check TODO.md**: See what's currently being worked on
3. **Check CHANGELOG.md**: See recent changes for patterns
4. **Update architecture docs**: If adding new systems, update `.agent/architecture/`
5. **Follow existing patterns**: Match code style of surrounding files
6. **Keep types in sync**: Go models and TypeScript types must match
7. **Test with large files**: The app is designed for 1GB+ log files

### When to Look Elsewhere

| If you're looking for... | Check... |
|--------------------------|----------|
| Current project phase or roadmap | [CONTEXT.md](./CONTEXT.md) |
| What tasks are in progress | `.agent/TODO.md` |
| What was recently changed | `.agent/CHANGELOG.md` |
| How to test a specific feature | [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) |
| Architecture diagrams or data flows | `.agent/architecture/` |
| Session startup procedures | [CONTEXT.md](./CONTEXT.md) "Session Instructions" |
| Testing commands and hierarchy | [CONTEXT.md](./CONTEXT.md) "Testing" section or [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) |
