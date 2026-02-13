# CIM Visualizer

A web-based application for analyzing **Industrial PLC (Programmable Logic Controller) log files** with advanced visualization capabilities.

![CIM Visualizer](frontend/public/screenshot.png)

## What is CIM Visualizer?

CIM Visualizer is a factory automation analysis tool that transforms raw PLC log data into meaningful visualizations. It's designed for engineers and technicians who need to debug, analyze, and troubleshoot semiconductor manufacturing equipment (AMHS - Automated Material Handling Systems).

### The Problem It Solves

Industrial PLCs generate massive log files (often 1GB+) containing thousands of signals, timestamps, and state changes. Reading these raw text files is nearly impossible for humans. CIM Visualizer provides:

- **Structured data parsing** - Convert raw log formats into structured data
- **Timeline visualization** - See signal state changes as waveforms
- **Factory layout mapping** - Visualize equipment states on a factory map
- **Multi-file correlation** - Merge and analyze logs from multiple sources

## Key Features

| Feature | Description |
|---------|-------------|
| **Multi-Format Parsing** | Supports PLC debug logs, MCS/AMHS logs, CSV, and tab-separated formats |
| **Log Table** | Virtual scrolling table with sorting, filtering, multi-selection, and color coding |
| **Waveform View** | Canvas-based signal visualization with zoom, pan, time selection, and viewport virtualization |
| **Map Viewer** | SVG-based factory layout with carrier tracking and playback |
| **Multi-File Merge** | Select and merge multiple log files with 1s fuzzy deduplication |
| **Color Coding** | Customizable row/value colors by category, signal pattern, value severity, device |
| **Bookmarks** | Cross-view time bookmarks with keyboard shortcuts |
| **Large File Support** | Handles files up to 1GB+ with DuckDB-backed storage (<100MB memory) |

## Quick Start

### Prerequisites

- Go 1.21 or later
- Node.js 20 or later
- npm or compatible package manager

### Development

```bash
# Run both backend and frontend
make dev

# Or separately
cd backend && go run cmd/server/main.go  # Backend on :8089
cd frontend && npm run dev               # Frontend on :5173
```

### Production

```bash
docker-compose up --build
```

## Workflow: Upload → Parse → Visualize

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │ ──▶ │   Parse     │ ──▶ │   Analyze   │ ──▶ │  Visualize  │
│ Log Files   │     │   Session   │     │   Signals   │     │   Results   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 1. Upload

Upload PLC log files via:
- **HTTP**: Standard file upload (`POST /api/files/upload`)
- **WebSocket**: Chunked upload for large files (`WS /api/ws/uploads`)

Supports chunked uploads for files exceeding 5MB.

### 2. Parse

The backend parses log files into structured `LogEntry` records:

```go
type LogEntry struct {
    DeviceID    string      // PLC device identifier
    SignalName  string      // Signal/point name
    Timestamp   time.Time   // Event timestamp
    Value       interface{} // bool, string, or int
    SignalType  SignalType  // boolean, string, or integer
    Category    string      // Category from PLC debug format
    SourceID    string      // File ID for merged sessions
}
```

### 3. Analyze

After parsing, you can:
- Browse entries in a paginated table
- Filter by device, signal, time range
- Merge multiple files with fuzzy deduplication
- Export filtered views

### 4. Visualize

Three synchronized visualization views:

| View | Purpose |
|------|---------|
| **Log Table** | Raw data browsing with sorting/filtering |
| **Waveform** | Signal timing diagrams (like logic analyzers) |
| **Map** | Factory equipment layout with real-time states |

## Key Concepts

### PLC Logs

PLCs (Programmable Logic Controllers) are industrial computers that control manufacturing equipment. They continuously log:
- **Input states** - Sensor readings
- **Output states** - Actuator commands
- **Internal variables** - Counters, timers, flags

### Waveform Visualization

Similar to digital logic analyzers, waveforms display signal states over time:

```
Signal: LIGHT_DOOR
        ┌───────┐     ┌───────┐     ┌───────┐
        │ ON    │     │ OFF   │     │ ON    │
────────┘       └───────┘       └───────┘
         10:00:01    10:00:05    10:00:12
```

### Map Viewer

Factory floor visualization showing:
- **Equipment positions** - Conveyors, diverters, ports
- **Carrier positions** - Wafer/carrier locations
- **State-based coloring** - Equipment status indicators

### Carrier Tracking

Track material carriers (wafer cassettes, FOUPs) as they move through the factory. Carriers are logged with timestamps and positions on the map.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Go 1.21+ | High-performance server |
| **Web Framework** | Echo v4 | REST API framework |
| **Frontend** | Preact 10.x | Lightweight React alternative |
| **State Management** | @preact/signals | Reactive signals |
| **Build Tool** | Vite | Dev server & bundler |
| **Styling** | CSS Variables | Industrial dark theme |
| **Testing** | Vitest + Playwright | Unit & E2E tests |
| **Browser Target** | Chrome only | Industrial environment |

## Project Structure

```
/web_version
├── README.md              ← You are here
├── AGENTS.md              ← AI coding agent guide
├── CONTEXT.md             ← Session context & quick start
├── TESTING_CHECKLIST.md   ← Manual testing procedures
├── Makefile               ← Development commands
├── docker-compose.yml     ← Production deployment
├── mapping_and_rules.yaml ← Sample map configuration
│
├── .agent/                ← Agent workspace
│   ├── architecture/      ← Architecture documentation
│   ├── workflows/         ← Agent workflows
│   ├── SCRATCHPAD.md      ← Current thinking
│   ├── CHANGELOG.md       ← What's been done
│   └── TODO.md            ← Task tracking
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
│   └── Dockerfile
│
└── frontend/              ← Preact frontend
    ├── src/
    │   ├── api/           ← API client
    │   ├── models/        ← TypeScript types
    │   ├── stores/        ← Signal-based stores
    │   ├── components/    ← UI components
    │   │   ├── file/      ← File upload, recent files
    │   │   ├── log/       ← Log table
    │   │   ├── waveform/  ← Waveform canvas, sidebar
    │   │   ├── map/       ← Map canvas, controls
    │   │   └── layout/    ← Nav buttons, split pane
    │   └── views/         ← Main views
    └── Dockerfile
```

## API Endpoints

### File Management

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

### Parse Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/parse` | Start parsing (single or merged) |
| GET | `/api/parse/:sessionId/status` | Parse progress |
| GET | `/api/parse/:sessionId/entries` | Paginated entries |
| GET | `/api/parse/:sessionId/chunk` | Time-window chunk |
| GET | `/api/parse/:sessionId/signals` | List signals |
| GET | `/api/parse/:sessionId/categories` | List categories |
| GET | `/api/parse/:sessionId/stream` | SSE stream entries |
| POST | `/api/parse/:sessionId/keepalive` | Keep session alive |

### Map & Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/map/layout` | Get map layout |
| POST | `/api/map/upload` | Upload map XML |
| GET/POST | `/api/map/rules` | Map rules (YAML) |
| GET | `/api/map/files/recent` | Recent map files |
| GET | `/api/map/defaults` | List default maps |
| POST | `/api/map/defaults/load` | Load default map |
| POST | `/api/map/carrier-log` | Upload carrier log |
| GET | `/api/map/carrier-log` | Get carrier log info |
| GET | `/api/map/carrier-log/entries` | Carrier positions |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Add bookmark at current time |
| `Ctrl+Shift+B` | Toggle bookmark panel |
| `Ctrl+]` | Jump to next bookmark |
| `Ctrl+[` | Jump to previous bookmark |

## Documentation

| Document | Description |
|----------|-------------|
| [AGENTS.md](./AGENTS.md) | AI coding agent guide |
| [CONTEXT.md](./CONTEXT.md) | Session context & quick start |
| [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) | Manual testing procedures |
| [.agent/architecture/](./.agent/architecture/) | Detailed architecture docs |

## License

Internal project - All rights reserved.
