# TODO.md — Task Tracking

> Check off tasks as you complete them. Add new tasks as they arise.

---

## 🚧 Active: Phase 3 — Map Viewer + Carrier Tracking

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

## 📋 Backlog: Future Phases

### Phase 6: Signal Validation (Post-MVP)
- [ ] Load validation rules from YAML
- [ ] Sequence, timing, value range validators
- [ ] YAML editor with syntax highlighting
- [ ] Results panel with violation navigation

---

## ⚡ Performance & Stability

- [x] 1GB file uploads successfully (chunked)
- [ ] Parse 1GB file completes (with progress)
- [ ] 100k+ entries in Log Table → smooth scroll
- [ ] 100+ signals in Waveform → smooth pan/zoom
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
