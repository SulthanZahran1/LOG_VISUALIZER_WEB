# CIM Visualizer Frontend Documentation

> **Start Here:** Read [AGENTS.md](../AGENTS.md) first for project context and development guidelines.

## Overview

The CIM Visualizer is a web-based PLC (Programmable Logic Controller) log visualization tool built with **Preact** and **TypeScript**. It provides interactive visualization of industrial automation data including timing diagrams (waveforms), log tables, map viewers, and transition analysis.

### Tech Stack

- **Framework**: Preact with Vite
- **State Management**: @preact/signals (reactive state)
- **Styling**: CSS with CSS variables (dark industrial theme)
- **Build Tool**: Vite
- **Testing**: Vitest + Playwright

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              App Shell (app.tsx)                            │
│  - Header, Tabs, Footer, Help Modal, Bookmark Panel, Notifications          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
        ┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
        │   HomeView.tsx    │ │  Views/        │ │   Stores/         │
        │   - File Upload   │ │   Components   │ │   (Global State) │
        │   - File List     │ │                │ │                   │
        └───────────────────┘ └───────────────┘ └───────────────────┘
                    │                         │
                    ▼                         ▼
        ┌───────────────────┐     ┌───────────────────────────────┐
        │   API Layer       │     │   Components                   │
        │   (api/client.ts) │     │   - log/ (LogTable)           │
        │   - upload.ts     │     │   - waveform/ (WaveformView)  │
        │   - websocketUpload│    │   - map/ (MapViewer)          │
        └───────────────────┘     │   - transition/                │
                                 │   - file/ (FileUpload, Recent)  │
                                 │   - layout/ (NavButton)         │
                                 └───────────────────────────────┘
```

---

## Directory Structure

```
frontend/src/
├── api/                    # API client and upload handlers
│   ├── client.ts          # REST API endpoints
│   ├── upload.ts          # Optimized HTTP upload (chunked + gzip)
│   ├── websocketUpload.ts # WebSocket upload client
│   └── logEncoder.ts      # Log compression utilities
│
├── components/             # Reusable UI components
│   ├── file/              # FileUpload, RecentFiles, LoadedFileCard
│   ├── log/               # LogTable, LogTableRow
│   ├── waveform/          # WaveformView, WaveformCanvas
│   ├── map/              # MapViewer components
│   ├── transition/       # TransitionView components
│   ├── layout/           # NavButton, panel components
│   ├── settings/         # Settings panels (ColorCodingSettings)
│   └── icons.tsx         # SVG icon components
│
├── stores/                # Global state (Preact Signals)
│   ├── logStore.ts       # Log entries, session, filtering, sorting
│   ├── waveformStore.ts  # Waveform view state, zoom, scroll
│   ├── mapStore.ts       # Map layout, playback, carrier tracking
│   ├── bookmarkStore.ts  # Bookmarks, sync between views
│   ├── transitionStore.ts# Transition rules and calculations
│   ├── selectionStore.ts # Signal selection state
│   └── colorCodingStore.ts # Color coding settings
│
├── views/                 # Page-level components
│   ├── HomeView.tsx      # Landing page with upload + navigation
│   └── MapViewer.tsx     # Map visualization wrapper
│
├── utils/                 # Utility functions
│   ├── base64.ts         # File to base64 conversion
│   ├── TimeAxisUtils.ts  # Time axis formatting
│   └── persistence.ts    # LocalStorage helpers
│
├── models/               # TypeScript type definitions
│   └── types.ts          # Shared types (LogEntry, FileInfo, etc.)
│
├── workers/              # Web Workers for heavy computation
│
├── app.tsx               # Main application shell
└── main.tsx             # Entry point
```

---

## State Management (@preact/signals)

The frontend uses **Preact Signals** for reactive, fine-grained state management. Stores are located in `src/stores/` and exported as reactive signals.

### Store Responsibilities

| Store | Purpose | Key Signals |
|-------|---------|------------|
| `logStore.ts` | Current log session, entries, filtering, sorting | `currentSession`, `logEntries`, `searchQuery`, `sortColumn` |
| `waveformStore.ts` | Waveform view controls | `scrollOffset`, `zoomLevel`, `selectedSignals`, `waveformEntries` |
| `mapStore.ts` | Map layout, playback, carrier tracking | `mapLayout`, `playbackTime`, `carrierLocations` |
| `bookmarkStore.ts` | Time bookmarks, view sync | `bookmarks`, `isSyncEnabled` |
| `transitionStore.ts` | Transition rules, statistics | `transitionRules`, `transitionResults` |
| `selectionStore.ts` | Signal selection state | `selectedSignals`, `focusedSignal` |
| `colorCodingStore.ts` | Color coding settings | `colorMode`, `customColors` |

### Reactive Patterns

```typescript
// Derived/computed values
export const filteredEntries = computed(() => {
    // Automatically recalculates when dependencies change
    return logEntries.value.filter(/* ... */);
});

// Side effects
effect(() => {
    // Runs whenever tracked signals change
    saveSession(currentSession.value);
});
```

---

## API Endpoints

All API calls go through `/api/*` which is proxied to the backend server.

### Health & Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Backend health check |
| POST | `/files/upload` | Single file upload (small files) |
| POST | `/files/upload/chunk` | Chunk upload endpoint |
| POST | `/files/upload/complete` | Finalize chunked upload |
| GET | `/files/recent` | List recent files |
| GET | `/files/:id` | Get file metadata |
| DELETE | `/files/:id` | Delete a file |
| PUT | `/files/:id` | Rename a file |

### Parsing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/parse` | Start parsing a file (returns session) |
| POST | `/parse` (with `fileIds`) | Start merged parse of multiple files |
| GET | `/parse/:sessionId/status` | Get parse status |
| GET | `/parse/:sessionId/signals` | List all signals |
| GET | `/parse/:sessionId/categories` | List categories |
| GET | `/parse/:sessionId/entries` | Paginated log entries |
| POST | `/parse/:sessionId/chunk` | Get entries in time range |
| POST | `/parse/:sessionId/at-time` | Get values at specific time |
| GET | `/parse/:sessionId/stream` | Server-Sent Events stream |
| POST | `/parse/:sessionId/keepalive` | Keep session alive while actively viewing |

### Map & Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/map/layout` | Get active map layout |
| POST | `/map/upload` | Upload map XML |
| POST | `/map/rules` | Upload rules YAML |
| GET | `/map/rules` | Get current rules |
| POST | `/map/active` | Set active map |
| GET | `/map/files/recent` | Recent map files |
| GET | `/map/defaults` | List default maps |
| POST | `/map/defaults/load` | Load a default map |
| POST | `/map/carrier-log` | Upload carrier log |
| GET | `/map/carrier-log` | Get carrier log info |
| GET | `/map/carrier-log/entries` | Get carrier entries |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/api/ws/uploads` | WebSocket for file uploads (single persistent connection) |

---

## Upload Flow

### Entry Points

1. **Drag & Drop** - Drop zone in `FileUpload.tsx`
2. **Click to Browse** - Standard file input
3. **Paste Content** - Text paste (creates Blob → File)
4. **Clipboard** - File from clipboard

### Upload Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                        handleFile(file)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ File > 5MB?         │
                    └─────────────────────┘
                          │         │
                         YES       NO
                          │         │
                          ▼         ▼
              ┌─────────────────┐  ┌──────────────┐
              │ Try WebSocket   │  │ HTTP Upload  │
              │ (single conn,  │  │ (uploadFile) │
              │  firewall-safe)│  └──────────────┘
              └─────────────────┘
                     │         │
                   OK       FAIL
                    │         │
                    ▼         ▼
           ┌──────────────┐ ┌─────────────────┐
           │ uploadFile   │ │ Fall back to     │
           │ WebSocket    │ │ HTTP (uploadFile │
           └──────────────┘ │ Optimized)       │
                           └─────────────────┘
```

### Optimized Upload Pipeline (HTTP)

```
File → [Gzip Compression] → [5MB Chunks] → [Parallel Upload (3 concurrent)]
                                                    │
                                                    ▼
                              ┌────────────────────────────────────┐
                              │ Async Processing + SSE Progress    │
                              │ (no timeout issues for large files)│
                              └────────────────────────────────────┘
                                                    │
                                                    ▼
                                          ┌─────────────────┐
                                          │ Server:          │
                                          │ 1. Assemble      │
                                          │ 2. Decompress    │
                                          │ 3. Parse        │
                                          │ 4. Index         │
                                          └─────────────────┘
                                                    │
                                                    ▼
                                          ┌─────────────────┐
                                          │ Return FileInfo  │
                                          └─────────────────┘
```

### WebSocket Upload Flow

```
Client                                              Server
  │                                                   │
  │────────── Connect ───────────────────────────────▶│
  │                                                   │
  │────────── upload:init ───────────────────────────▶│
  │◀───────── ack (uploadId) ────────────────────────│
  │                                                   │
  │──┬──── upload:chunk (repeated for each chunk) ──▶│
  │  │                                                   │
  │◀─┴──── progress (server acknowledgment) ──────────│
  │                                                   │
  │────────── upload:complete ────────────────────────▶│
  │                                                   │
  │◀───────── processing (assemble, decompress) ───────│
  │                                                   │
  │◀───────── complete (fileInfo) ────────────────────│
```

### Debug Panel (New)

After each upload, a **Debug Stats** panel appears showing:

| Metric | Description |
|--------|-------------|
| Original Size | Raw file size (MB) |
| Compressed Size | Size after gzip compression (MB) |
| Compression Ratio | % reduction achieved |
| Upload Time | Total upload duration (ms) |
| Algorithm | Compression used (gzip) |
| Memory Peak | JS heap usage during upload |

**Features:**
- Collapsible panel (click header to toggle)
- Color-coded compression ratio (green ≥80%, yellow 60-80%)
- Copy stats to clipboard button

---

## Component Relationships

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User Action (Upload / Select File)                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  HomeView → FileUpload / RecentFiles                                     │
│  ├─ onUploadSuccess(file)                                               │
│  └─ onFileSelect(file)                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  logStore.ts                                                             │
│  ├─ startParsing(fileId) ──▶ API ──▶ ParseSession                       │
│  └─ pollStatus() ──▶ fetchEntries() ──▶ logEntries signal              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │ LogTable.ts│ │WaveformView │ │ MapViewer.ts│
            │ (entries)   │ │ (signals)   │ │ (playback)  │
            └─────────────┘ └─────────────┘ └─────────────┘
                    │               │               │
                    └───────────────┴───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Derived State (computed signals)                                       │
│  ├─ filteredEntries  (search, category, type filters)                   │
│  ├─ availableSignals (grouped by device)                               │
│  └─ signalHistory (timestamped values for playback)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Component Chains

**Upload → Parse → Display:**
```
FileUpload → API.uploadFile → logStore.startParsing → 
logStore.pollStatus → logStore.fetchEntries → 
LogTable / WaveformView / MapViewer
```

**Waveform Selection → Map Coloring:**
```
WaveformView (signal selection) → selectionStore.selectedSignals →
mapStore.latestSignalValues → mapStore.getUnitColor → MapViewer rendering
```

**Playback Sync:**
```
mapStore.playbackTime ↔ waveformStore.scrollOffset
(when isSyncEnabled in bookmarkStore)
```

**Bookmarks:**
```
bookmarkStore.addBookmark() → waveformJumpToTime() + playbackTime update
```

---

## View Modes

| View | Component | Purpose | Key Store |
|------|-----------|---------|----------|
| **Home** | `HomeView.tsx` | Upload, file management, navigation | `logStore.currentSession` |
| **Log Table** | `LogTable.tsx` | Paginated entry list with filters/sort | `logStore.logEntries` |
| **Waveform** | `WaveformView.tsx` | Timing diagram with zoom/pan | `waveformStore.*` |
| **Map Viewer** | `MapViewer.tsx` | Factory map with carrier positions | `mapStore.*` |
| **Transitions** | `TransitionView.tsx` | Tact time analysis | `transitionStore.*` |

---

## Large File Optimizations

### Server-Side Mode (>100k entries)

When `logStore.useServerSide` is true:

1. **Initial Load**: Fetch only first page (200 entries) + categories
2. **Filtering**: Passed to backend via query params
3. **Pagination**: Server returns specific pages
4. **Client Cache**: Last 10 pages cached (30s TTL)
5. **Waveform**: Fetch only visible viewport chunk
6. **Map**: Fetch values at current playback time via `getValuesAtTime`

### Streaming Mode (10k-100k entries)

- Use Server-Sent Events (`streamParseEntries`) for progressive loading
- Entries added to `logEntries` as batches arrive

### Small Files (<10k)

- Fetch all entries upfront
- Client-side filtering/sorting
- Full signal history in memory

---

## Debugging

### Window Global Objects

Exposed for browser console debugging:

```javascript
window.logStore      // logStore signals
window.waveformStore // waveformStore signals  
window.bookmarkStore // bookmarkStore signals
window.mapStore      // (in mapStore.ts)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Override backend API URL (default: `/api`) |

---

## Build & Deployment

```bash
# Development
npm run dev          # Vite dev server with HMR

# Production Build
npm run build        # Outputs to dist/

# Testing
npm run test        # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
npm run lint        # ESLint
```

---

## Recent Changes

### v0.8.0 (February 2026)

- **Color Coding**: Customizable log table row/value colors
  - Multiple color modes: category, signal pattern, value severity, device, signal type
  - ColorCodingSettings component with full UI for customization
  - Settings persist via localStorage
- **Multi-File Upload UX**: Complete redesign with mode toggle and auto-merge
  - Upload mode toggle (Single/Multi-file)
  - Multi-file queue UI with per-file status
  - Overall progress bar
  - Auto-merge after multi-file upload completes

### v0.7.0 (February 2026)

- **Waveform Virtualization**: Viewport-based rendering for 100+ signals
  - Only visible signal rows drawn (+ 2-row buffer)
  - Scroll-based virtualization
  - Smooth pan/zoom regardless of signal count
- **Session Keep-Alive**: Sessions stay alive while actively viewing
  - 5-minute keep-alive window
  - `POST /api/parse/:sessionId/keepalive` endpoint
  - TouchSession() called on all session API access

### v0.6.0 (January 2026)

- **Category Column Filter**: Filter popover on Category header
- **Loaded/Recent Tabs**: Tabbed interface for file management
- **Multi-File Merge**: Select multiple files, fuzzy deduplication

### v0.5.0 (January 2026)

- **Bookmarks**: Ctrl+B to add, Ctrl+Shift+B for panel
- **Bidirectional Time Sync**: Sync between Waveform and Map views

### v0.4.0 (January 2026)

- **Map Media Player**: Play/pause, speed control, time scrubber
- **Signal-Based Map Coloring**: Units change color based on signal values

### v0.2.0 (Phase 3: Map Viewer)

- ✅ Map Viewer with carrier tracking
- ✅ Upload debug panel (compression stats)
- ✅ WebSocket upload support (large files)
- ✅ Bidirectional time sync between views
- ✅ Merged file parsing (multiple files)
- ✅ Large file optimization (>100k entries)

## Documentation Index

| Document | When to Reference |
|----------|------------------|
| **[AGENTS.md](../AGENTS.md)** | Project overview, development guidelines |
| **[API.md](../API.md)** | REST API endpoints, upload protocol |
| **[backend/README.md](../backend/README.md)** | Backend architecture |
| **[backend/UPLOAD_HANDLING.md](../backend/UPLOAD_HANDLING.md)** | Upload pipeline details |
