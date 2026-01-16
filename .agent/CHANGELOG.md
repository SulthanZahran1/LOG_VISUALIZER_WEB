# CHANGELOG.md — What's Been Done

> Append-only log. Add entries at the top as work is completed.
> Format: `## YYYY-MM-DD: Summary`

## 2026-01-16: Enhanced Paste Support (Forcepoint Bypass)

### Frontend
- Added `onPaste` handler to `FileUpload.tsx` for clipboard file/text paste.
- Replaced memory-intensive `readAsText()` with Blob re-wrapping technique.
- Large text pastes are now converted directly to `.log` files.
- Updated drop zone UI to indicate paste functionality.
- Added unit tests for paste handling (`FileUpload.test.tsx`).

## 2026-01-15: Chunked Upload Implementation (1GB+ Support)


### Backend
- Implemented `Store` interface methods `SaveChunk` and `CompleteChunkedUpload` in `LocalStore`.
- Added `POST /api/files/upload/chunk` and `POST /api/files/upload/complete` endpoints.
- Increased server body limit to 1GB using Echo middleware.
- Added integration tests for chunk assembly flow in `handlers_test.go`.

### Frontend
- Implemented `uploadFileChunked` in `client.ts` with 5MB chunking and progress reporting.
- Refactored `FileUpload.tsx` to use chunked uploads for files > 5MB.
- Optimized memory usage by removing unnecessary `FileReader.readAsText` for large files.
- Added visual progress bar to the upload UI.

## 2026-01-15: File Upload Improvements
- Updated Drag & Drop handling to read file content client-side (`FileReader`) before upload.
  - Fixes issues where direct file uploads are blocked by local policies.
  - Providing a seamless "Drag to Paste" experience.
- Added "Paste Content" feature to `FileUpload.tsx` to bypass file system restrictions.
  - Users can now paste log text directly into a textarea.
  - content is converted to a virtual file and processed via the existing upload pipeline.

## 2026-01-15: Phase 3 — Map Viewer Backend & Initial Frontend

### Backend
- Implemented `MapLayout` and `MapObject` models in Go.
- Created `MapXML` parser (`map_parser.go`) following the reference Python implementation.
- Added `GET /api/map/layout` and `POST /api/map/upload` handlers in `handlers.go`.
- Added unit tests for the parser and integration tests for the API.

### Frontend
- Created `mapStore.ts` using Preact signals for map state (layout, zoom, offset, selection).
- Implemented `MapCanvas.tsx` using SVG for performance and ease of interaction.
- Created modular `MapObjectComponents.tsx` (Belt, Arrow, Label).
- Added `MapViewer` view with an "Upload Map" placeholder and toolbar.
- Integrated Map Viewer into the main application tabbed layout.
- Updated version display to v0.2.0.

---


- Implemented **Logarithmic Zoom Slider** in `WaveformToolbar.tsx` for natural zoom control.
- Added **Signal Color-coding by Device** (accent bars in sidebar and canvas).
- Added **Interactive Signal Focus** with cross-component highlighting.
- Implemented **Right-click Context Menu** for signals (Hide, Show Only).
- Centralized `deviceColors` and `focusedSignal` in `waveformStore.ts`.

---

- Centralized filter state (search, regex, type) in `waveformStore.ts`.
- Implemented `FilterPreset` management (save/load/delete) with `localStorage` persistence.
- Added Presets UI to `SignalSidebar.tsx`:
  - Dropdown for loading and deleting presets.
  - Modal-less save dialog.
- Cleaned up linting errors and optimized `useMemo` hooks.

---

## 2026-01-15: "Show Changed" Filter Implementation

### Backend
- Added `GetSignals` to `session.Manager` to retrieve all unique signal keys.
- Added `GET /api/parse/:sessionId/signals` endpoint to `handlers.go`.
- Registered route in `main.go`.

### Frontend
- Added `getParseSignals` to `api/client.ts`.
- Updated `waveformStore.ts`:
  - Added `allSignals`, `showChangedInView`, and `signalsWithChanges` signals.
  - Added effect to fetch all signals on session completion.
  - Added effect to fetch time-windowed chunks and identify active signals when filtering is enabled.
  - Updated `availableSignals` to use the full signal list.
- Updated `SignalSidebar.tsx`:
  - Added "Show signals with changes in view" toggle.
  - Implemented logic to filter the signal tree based on detected activity.
- Fixed async effect linting issues and unrelated JSX import errors.

---

## 2026-01-15: Phase 2 — Waveform Interaction Polish

### Drag Panning & Navigation
- Added click-drag panning to `WaveformCanvas.tsx` (grab/grabbing cursor)
- Added arrow key navigation (Left/Right to pan viewport)
- Made canvas focusable with visual focus indicator

### Jump to Time
- Added `jumpToTime(ms)` function to `waveformStore.ts`
- Added Jump to Time input field to `WaveformToolbar.tsx`
- Parses HH:MM:SS and HH:MM:SS.mmm formats
- Shows error state for invalid input

### Lint Fixes
- Fixed 1 error and 19 warnings across 10 files
- Replaced `any` types with proper interfaces
- Fixed unused variables and hook dependencies
- Added Window interface extensions for debugging

### Tests
- Updated E2E test to verify panning works (was checking disabled)
- Fixed Log Table tab name in E2E tests (`Log Viewer` → `Log Table`)
- All 10 E2E tests passing

---

## 2026-01-15: UX Flow Alignment + Signal Selector

### UX Flow Alignment
- Aligned web app navigation with desktop reference
- Views (Timing Diagram, Log Table) now open as separate closeable tabs instead of split panes
- Updated `logStore.ts` with `openViews` signal and `openView()`/`closeView()` functions
- Updated `app.tsx` with dynamic tab rendering and close buttons
- Updated `HomeView.tsx` navigation buttons to use new view management
- Fixed `LogTable.tsx` to remove split pane buttons

### Signal Selector
- Added device/signal checkbox tree to Waveform View sidebar
- Collapsible device groups with expand/collapse arrows
- Individual signal checkboxes and "select all" per device
- Count indicators showing `X/Y` selected signals per device
- Search filter with optional regex mode
- Updated `waveformStore.ts` with `availableSignals` computed and helper functions
- Rewrote `SignalSidebar.tsx` with tree-style checkbox UI

---

## 2026-01-14: Phase 2 — Waveform Toolbar & Cursor (Session 2)

### Waveform Toolbar
- Created `WaveformToolbar.tsx` with:
  - Zoom controls (+/- buttons, fit to window)
  - Zoom presets (1s, 10s, 1min, 10min, 1hr)
  - Navigation (go to start/end buttons)
  - Cursor time readout display
- Integrated toolbar into `WaveformView.tsx`
- Restructured view layout: Toolbar → Main (Sidebar + Canvas)

### Cursor Enhancements
- Added hover cursor line (dashed blue vertical line)
- Added `hoverTime` signal for cursor position tracking
- Cursor time displayed in toolbar readout

### Bug Fixes
- Fixed ESLint `RequestInit` and `FormData` not defined errors
- Fixed Waveform Toolbar buttons being incorrectly disabled without data
- Added missing browser globals to `eslint.config.js`
- Fixed unused parameter warnings

### Test Data
- Created `test_sample.log` generation script (1200 entries)
- verified zoom/pan functionality with larger dataset

---

## 2026-01-14: Testing Infrastructure + UI/UX Overhaul

### Testing Infrastructure
- Installed Vitest + Testing Library for unit testing
- Installed Playwright for E2E testing
- Installed ESLint with TypeScript + React Hooks plugins
- Created configuration files:
  - `vitest.config.ts` - Unit test config with happy-dom
  - `playwright.config.ts` - E2E config for Chromium
  - `eslint.config.js` - Flat config with TypeScript
  - `src/test/setup.ts` - Test setup with mocks
- Added example tests:
  - `TimeAxisUtils.test.ts` - 9 unit tests
  - `NavButton.test.tsx` - 6 component tests
  - `e2e/home.spec.ts` - 5 E2E tests
  - `e2e/log-viewer.spec.ts` - 4 E2E tests
- Updated `package.json` with test scripts
- Created `.agent/workflows/testing.md` workflow

### UI/UX Overhaul
- Consolidated conflicting CSS themes into unified dark industrial theme
- Updated all major components to use consistent dark styling:
  - `app.tsx`, `WaveformCanvas.tsx`, `SignalSidebar.tsx`
  - `LogTable.css`, `HomeView.tsx`, `NavButton.tsx`
  - `FileUpload.tsx`, `RecentFiles.tsx`
- Fixed waveform canvas to use dark background with bright green signals
- Replaced emoji icons with SVG icons throughout

---

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
- Implemented `Registry` in `backend/internal/parser/registry.go` for auto-detection.
- Verified all parsers with a comprehensive test suite.

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

---

## 2026-01-13: Project Documentation Setup

- Created `CONTEXT.md` with session context and architecture
- Created `TESTING_CHECKLIST.md` with test cases
- Created `.agent/` folder structure:
  - `TODO.md` - Task tracking
  - `CHANGELOG.md` - This file
  - `SCRATCHPAD.md` - Notes and blockers
- Defined 6-phase development roadmap
- Documented key types (Go and TypeScript)
- Established code conventions
