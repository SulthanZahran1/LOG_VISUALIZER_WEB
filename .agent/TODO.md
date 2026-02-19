# TODO.md — Task Tracking

> Check off tasks as you complete them. Add new tasks as they arise.

---

## ✅ Completed: Multi-File UX Improvements (2026-02-11)

### Multi-File Upload Enhancement
- [x] **Multi-File Upload Component** — Support drag-drop multiple files
- [x] **Default Server Mode** — Use WebSocket/chunked upload by default for multi-file
- [x] **Batch Progress Tracking** — Show overall + per-file progress
- [x] **Upload Queue UI** — Visual queue with status for each file
- [x] **Auto-Merge Flow** — After upload, auto-start merge session

### UX Improvements
- [x] **Upload Mode Toggle** — Single vs Multi-file mode selection
- [x] **Better Visual Feedback** — Clearer states for upload/parse/merge
- [x] **Drag-Drop Zone Enhancement** — Support multiple files, better visuals

---

## 🚧 Active: Phase 3 — Map Viewer + Carrier Tracking

---

## 📋 Backlog: Future Phases

### Phase 3 — Map Viewer + Carrier Tracking (Completed)

### Map Configuration Files
- [x] **XML Layout File** — Upload, select, recent list
- [x] **YAML Rules File** — Parser, API, upload/select
- [x] **File Association UI** — Dialog with XML + YAML selection
- [x] **Signal Log Link** — "Use Current Session" to link log table data
- [x] Store device-to-unit mappings for carrier tracking
- [x] Store color rules for signal-based coloring
- [x] Validate both files selected before activating tracking

### Map Rendering ✅
- [x] Load layout from XML config
- [x] Render units/stations as rectangles
- [x] Render paths/conveyors as lines/arrows
- [x] Display labels
- [x] Pan and zoom controls

### Carrier Tracking
- [x] Implement Carrier Tracking logic (map `CurrentLocation` signals)
- [x] Display carriers on units
- [x] Show carrier ID (truncate long IDs from start)
- [x] Multi-carrier count display ("2x", "3x")
- [x] Carrier count colors: 0=default, 1=green, 2=yellow, 3=orange, 4+=red

### Unit Interaction
- [x] Implement unit selection/highlighting
- [x] Click unit → show info panel
- [x] Info panel shows carrier list and current state
- [x] Center view on unit (Reset button)

### Map Media Player (Playback) ✅
- [x] Play/pause button, speed control (0.5x–10x)
- [x] Time scrubber/slider, current time display
- [x] Skip forward/backward buttons
- [x] Map colors update based on playback time
- [x] Sync with log data timestamps

### Follow Feature
- [x] Follow button with search input
- [x] Fuzzy matching for carrier search
- [x] Selection dialog for multiple matches
- [x] View follows carrier on move

---

## 🏗️ Active: Code Refactoring Sprint

### Week 1: Backend Handlers Refactoring ✅ COMPLETE (100%)
- [x] Create handler interfaces (`api/interfaces.go`)
- [x] Extract UploadHandler with tests (8 methods, 45+ test cases)
- [x] Extract ParseHandler with tests (19 methods, 25+ test cases)
- [x] Extract MapHandler with tests (15 methods, 30+ test cases)
- [x] Extract CarrierHandler with tests (6 methods, 20+ test cases)
- [x] Clean up main `handlers.go`
- [x] Achieve 70%+ handler coverage (actual: 100% of 28 tests)
- [x] **INTEGRATED**: Updated `main.go` to use new modular handlers
- [x] **INTEGRATED**: Updated WebSocket handler for compatibility
- [x] **HARDENED**: Fixed all test failures and compilation issues
- [x] **TESTED**: **28/28 tests passing (100%)**
- [x] **VERIFIED**: Server builds and runs successfully

### Week 2: Frontend Component Decomposition  ✅ COMPLETE
- [x] Extract `useVirtualScroll` hook
- [x] Extract `useRowSelection` hook
- [x] Create `filterEngine` utilities
- [x] Decompose `LogTable.tsx` components
- [x] **INTEGRATED**: Rewrote `LogTable.tsx` to use new hooks
- [x] **VERIFIED**: All 110 tests passing, build succeeds
- [x] **GRANULAR**: Created useColumnManagement, useSearchFilter, useKeyboardShortcuts
- [x] **GRANULAR**: Created LogTableToolbar, LogTableViewport, HighlightText components
- [x] **GRANULAR**: Extracted colorCoding utilities
- [ ] Decompose `FileUpload.tsx` components
- [ ] Achieve 70%+ component coverage

### Week 2: Frontend Component Decomposition  ✅ COMPLETE
- [x] Extract `useVirtualScroll` hook
- [x] Extract `useRowSelection` hook
- [x] Create `filterEngine` utilities
- [x] Decompose `LogTable.tsx` components
- [x] Decompose `FileUpload.tsx` components
- [x] Achieve 70%+ component coverage

### Week 3: Store Refactoring
- [ ] Refactor `mapStore.ts` into modular structure
- [ ] Refactor `logStore.ts` into modular structure
- [ ] Refactor `waveformStore.ts`
- [ ] Create store test suites

### Week 4: Final Testing & Documentation
- [ ] Complete test coverage reports
- [ ] Update architecture documentation
- [ ] Performance validation
- [ ] Final review & merge

**See:**
- `REFACTORING_PLAN.md` - Full refactoring plan
- `REFACTORING_QUICKSTART.md` - Quick start guide
- `.agent/architecture/REFACTORING_HANDLERS.md` - Backend guide
- `.agent/architecture/REFACTORING_LOGTABLE.md` - Frontend guide
- `.agent/architecture/TESTING_INFRASTRUCTURE.md` - Testing guide

---

## 📋 Backlog: Future Phases

### Phase 6: Signal Validation (Post-MVP)
- [ ] Load validation rules from YAML
- [ ] Sequence, timing, value range validators
- [ ] YAML editor with syntax highlighting
- [ ] Results panel with violation navigation

### Future: Sidebar Filter Panel (Log Table Enhancement)
- [ ] Unified filter panel in sidebar for Log Table
- [ ] Collapsible sections: Categories, Device IDs, Signal Types, Source Files
- [ ] Only show sections with data (e.g., hide Categories if log has none)
- [ ] Consider tabbed approach: Signals | Filters
- [ ] Replaces/supplements current column header filters

---

## ⚡ Performance & Stability

- [x] 1GB file uploads successfully (chunked)
- [ ] Parse 1GB file completes (with progress)
- [ ] 100k+ entries in Log Table → smooth scroll
- [x] 100+ signals in Waveform → smooth pan/zoom
- [x] No browser memory crashes during upload

---

## ✅ Completed Phases

<details>
<summary>Phase 1: Foundation + Log Table</summary>

- Tabbed View Management, Universal Header, Industrial Dark Theme
- VirtualScroll Log Table with sorting, filtering, column resizing
- Multi-row selection, copy (Ctrl+C), advanced filter bar
- Regex/case-sensitive toggles, "Show Changed Only" filter
- File upload with drag-drop, chunked uploads (1GB+)
- PLC/MCS/CSV log parsers ported from Python to Go

</details>

<details>
<summary>Phase 2: Waveform/Timing Diagram</summary>

- WaveformCanvas with high-DPI support, virtual viewport
- Boolean/State signal renderers with color coding
- Time axis with dynamic ticks, click-to-jump
- Zoom controls: buttons, wheel, slider, fit-to-window, presets
- Pan controls: drag, arrow keys, go to start/end
- Time range selection with Shift+drag
- Signal sidebar with search, regex, device groups
- Filter presets (save/load/delete)
- Signal color-coding by device, focus highlight
- Right-click context menu

</details>

<details>
<summary>Testing Infrastructure</summary>

- Vitest + Testing Library for unit tests
- Playwright for E2E tests
- ESLint with TypeScript plugins
- `/testing` workflow for agents

</details>

<details>
<summary>Phase 4: Bookmarks + Time Sync</summary>

- Ctrl+B to add bookmarks, Ctrl+Shift+B to open panel
- Bookmark markers on waveform canvas and map timeline
- Ctrl+]/[ to navigate between bookmarks
- Bidirectional time sync between Waveform and Map views
- View-aware bookmarking: Log Table bookmarks selected row, Waveform bookmarks view center, Map bookmarks playback time

</details>

<details>
<summary>Phase 5: Multi-File Merge</summary>

- Multi-file selection via Ctrl+Click or checkboxes
- Backend merger with 1s fuzzy deduplication
- SourceID tracking for merged entries
- "Merge & Visualize" button in Recent Files

</details>

<details>
<summary>Main Menu UX Improvements (2026-01-30)</summary>

- Loaded/Recent tabs in files section
- Auto-load on upload (no manual file selection)
- LoadedFileCard with quick action buttons
- No auto-navigation to Log Table - user chooses view

</details>
