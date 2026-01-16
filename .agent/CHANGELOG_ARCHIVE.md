# CHANGELOG_ARCHIVE.md — Historical Changes

> Archived entries from CHANGELOG.md. See main file for recent changes.

---

## 2026-01-15: Phase 2 Completion

### UI/UX Refinements
- Implemented **Logarithmic Zoom Slider** in `WaveformToolbar.tsx`
- Added **Signal Color-coding by Device** (accent bars in sidebar and canvas)
- Added **Interactive Signal Focus** with cross-component highlighting
- Implemented **Right-click Context Menu** for signals (Hide, Show Only)
- Centralized `deviceColors` and `focusedSignal` in `waveformStore.ts`

### Filter Presets
- Centralized filter state (search, regex, type) in `waveformStore.ts`
- Implemented `FilterPreset` management (save/load/delete) with `localStorage` persistence
- Added Presets UI to `SignalSidebar.tsx`

### "Show Changed" Filter
- Added `GetSignals` to `session.Manager` for unique signal keys
- Added `GET /api/parse/:sessionId/signals` endpoint
- Added `getParseSignals` to `api/client.ts`
- Updated `waveformStore.ts` with `allSignals`, `showChangedInView`, `signalsWithChanges`
- Updated `SignalSidebar.tsx` with "Show signals with changes in view" toggle

### Phase 2 — Waveform Interaction Polish
- Added click-drag panning to `WaveformCanvas.tsx`
- Added arrow key navigation (Left/Right to pan)
- Added `jumpToTime(ms)` function to `waveformStore.ts`
- Added Jump to Time input field (HH:MM:SS.mmm format)
- Fixed lint errors across 10 files

### UX Flow Alignment + Signal Selector
- Views now open as separate closeable tabs instead of split panes
- Updated `logStore.ts` with `openViews` signal and `openView()`/`closeView()` functions
- Added device/signal checkbox tree to Waveform sidebar
- Collapsible device groups with expand/collapse arrows

---

## 2026-01-14: Testing Infrastructure + UI/UX Overhaul

### Testing Infrastructure
- Installed Vitest + Testing Library for unit testing
- Installed Playwright for E2E testing
- Installed ESLint with TypeScript + React Hooks plugins
- Created configuration files: `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`
- Added example tests: TimeAxisUtils, NavButton, E2E home/log-viewer
- Created `.agent/workflows/testing.md` workflow

### UI/UX Overhaul
- Consolidated conflicting CSS themes into unified dark industrial theme
- Updated all major components to use consistent dark styling
- Fixed waveform canvas to use dark background with bright green signals
- Replaced emoji icons with SVG icons throughout

### Phase 2 — Waveform Toolbar & Cursor
- Created `WaveformToolbar.tsx` with zoom controls, presets, navigation
- Added hover cursor line (dashed blue vertical line)
- Fixed ESLint `RequestInit` and `FormData` not defined errors

### Phase 2 — Waveform Canvas Implementation
- Implemented `WaveformCanvas` using HTML5 Canvas
- Created `waveformStore` for viewport state and signal selection
- Added `SignalSidebar` for managing displayed signals
- Added "Add to Waveform" context menu action in Log Table
- Implemented `BooleanRenderer` and `StateRenderer`

---

## 2026-01-13: Foundation Complete

### Phase 1 — Foundation + Log Table Complete ✅
- Finalized Log Table with virtual scrolling and fixed row heights
- Implemented regex search, case-sensitivity, and "Show Changed Only" filters
- Integrated flexible layout engine and session-based tab navigation
- Added IndexedDB persistence for log sessions
- Verified all core log parsers (PLC Debug, PLC Tab, MCS, CSV) in Go
- Implemented Help overlay and universal header

### Log Parsers Implementation (Python -> Go)
- Implemented `Parser` interface in `backend/internal/parser/parser.go`
- Ported four major log parsers: PLCDebugParser, PLCTabParser, MCSLogParser, CSVSignalParser
- Implemented `Registry` for auto-detection
- Verified all parsers with comprehensive test suite

### Phase 1 Scaffold Complete
- Scaffolded Go backend with Echo v4.11.4
- Scaffolded Vite+Preact frontend with TypeScript
- Created root Makefile (`make dev`)
- Verified both servers work and communicate

### Project Documentation Setup
- Created `CONTEXT.md`, `TESTING_CHECKLIST.md`
- Created `.agent/` folder structure
- Defined 6-phase development roadmap
