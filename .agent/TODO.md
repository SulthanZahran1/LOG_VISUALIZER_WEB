# TODO.md — Task Tracking

> Check off tasks as you complete them. Add new tasks as they arise.
> Corresponds to development phases in CONTEXT.md and test cases in TESTING_CHECKLIST.md.

---

## Testing Infrastructure [COMPLETED]

- [x] Install Vitest + Testing Library
- [x] Install Playwright
- [x] Install ESLint + TypeScript plugins
- [x] Create `vitest.config.ts`
- [x] Create `playwright.config.ts`
- [x] Create `eslint.config.js`
- [x] Create test setup file
- [x] Write example unit tests (TimeAxisUtils, NavButton)
- [x] Write example E2E tests (home, log-viewer)
- [x] Create `/testing` workflow for agents
- [x] Update TESTING_CHECKLIST.md
- [x] Update CONTEXT.md
- [x] Update CHANGELOG.md

---

## Phase 1: Foundation + Log Table [COMPLETED]

### User Interface & Layout (UX Polish)
- [x] Tabbed View Management (views open as separate tabs)
- [x] Universal Header with: Sync, Clear, Help, Status
- [x] Theme: Industrial Dark (consistent with #003D82 primary blue)
- [x] Navigation Bar for active sessions

### Log Table View (Refined)
- [x] VirtualScroll component (fixed row height)
- [x] Columns: Timestamp, Device ID, Signal Name, Value, Type
- [x] Sorting (Multi-column support)
- [x] Column resizing (drag borders)
- [x] Multi-row selection + Copy (Ctrl+C)
- [x] Advanced Filter Bar:
  - [x] Regex Toggle
  - [x] Case-sensitive Toggle
  - [x] "Show Changed Only" (diff between consecutive lines)
  - [x] Pin current scroll/selection during sync
- [x] Advanced filter popup (integrated in toolbar)
- [x] Signal type filter (boolean/string/integer)
- [x] "Show changed" filter (signals with changes in view)
- [x] Copy selected rows (clipboard formatting: TS \t DEV \t SIG \t VAL)

---

## Phase 2: Waveform/Timing Diagram + Filtering [COMPLETED]

### Waveform Canvas
- [x] Create WaveformCanvas component (HTML Canvas)
- [x] High-DPI (retina) support
- [x] Visual highlight on selection (cursor line)
- [x] Virtual viewport (render visible time range only)

### Signal Renderers
- [x] BooleanRenderer (high/low waveform)
- [x] StateRenderer (boxes with value text)
- [x] Transition markers at state changes
- [x] Color coding per unique value

### Time Axis
- [x] Time labels (HH:MM:SS.mmm format)
- [x] Dynamic tick spacing based on zoom
- [x] Click axis to jump to time
- [x] Cursor position readout

### Grid Lines
- [x] Vertical grid lines (time intervals)
- [x] Alternating row backgrounds

### Zoom Controls
- [x] Zoom in/out buttons
- [x] Mouse wheel zoom (centered on cursor)
- [x] Zoom slider
- [x] Fit to window button
- [x] Zoom presets (1s, 10s, 1min, 10min, 1hr)

### Pan Controls
- [x] Click and drag to pan (mouse move)
- [x] Arrow keys navigation
- [x] Go to start/end buttons
- [x] Smooth panning (no jank)

### Time Range Selection
- [x] Click and drag to select range
- [x] Visual highlight on selection
- [x] Show duration of selection
- [x] Toolbar button for zoom to selection

### Signal Filtering
- [x] Search input (real-time filtering)
- [x] Regex mode toggle
- [x] Case-sensitive toggle
- [x] Device filter dropdown (via collapsible groups)
- [x] Signal type filter (boolean/string/integer)
- [x] "Show changed" filter (signals with changes in view)

### Filter Presets
- [x] Save current filter as preset
- [x] Load preset from dropdown
- [x] Delete preset
- [x] Store in localStorage

### Signal Labels
- [x] Sticky labels on left side (SignalSidebar)
- [x] Show Device::SignalName format
- [x] Color coding by device
- [x] Click label to focus signal
- [x] "Show changed only" toggle in toolbar
- [x] Sync waveform cursor with Log Table selection
- [x] Jump to time input (HH:MM:SS.mmm format)
- [x] Right-click context menu (hide, show only, etc.)

---

## Phase 3: Map Viewer + Carrier Tracking [IN PROGRESS]

### Map Configuration Files
> **Two files required**: XML layout + YAML rules (like desktop reference)

- [x] **XML Layout File** — defines visual layout (belts, diverters, ports, arrows)
  - [x] Upload new XML file via API
  - [x] Select from recently uploaded XML files
  - [x] Show recent XML files in Map Viewer sidebar
  
- [x] **YAML Rules File** — defines device-to-unit mappings and color rules
  - [x] Create YAML parser in backend
  - [x] Add `/api/map/rules` endpoint (upload/get)
  - [x] Upload new YAML rules file
  - [x] Select from recently uploaded YAML files
  - [ ] Store device-to-unit mappings for carrier tracking
  - [ ] Store color rules for signal-based coloring
  
- [x] **File Association UI** — combine XML + YAML
  - [x] Map Viewer shows current XML + YAML file names
  - [x] "Select Files" button opens file picker dialog
  - [x] Dialog shows recent XML files and recent YAML files
  - [ ] Validate that both files are selected before activating carrier tracking

### Map Rendering [COMPLETED]
- [x] Load layout from XML config (`map_parser.go`)
- [x] Render units/stations as rectangles (`MapCanvas.tsx`)
- [x] Render paths/conveyors as lines/arrows
- [x] Display labels
- [x] Pan and zoom controls

### Carrier Tracking
- [ ] Implement Carrier Tracking logic (map `CurrentLocation` signals)
- [ ] Display carriers on units
- [ ] Show carrier ID (truncate long IDs from start)
- [ ] Multi-carrier count display ("2x", "3x")
- [ ] Carrier count colors:
  - [ ] 0 carriers: default color
  - [ ] 1 carrier: green (#90EE90)
  - [ ] 2 carriers: yellow (#FFD700)
  - [ ] 3 carriers: orange (#FFA500)
  - [ ] 4+ carriers: red gradient

### Unit Interaction
- [x] Implement unit selection/highlighting
- [ ] Click unit → show info panel
- [ ] Info panel shows carrier list
- [ ] Info panel shows current state
- [x] Center view on unit (Reset button / initial fit)

### Follow Feature
- [ ] Follow button with search input
- [ ] Fuzzy matching for carrier search
- [ ] Selection dialog for multiple matches
- [ ] View follows carrier on move
- [ ] Stop Follow button

---

## Phase 3.5: Playback Feature

### Playback Controls
- [ ] Play/pause button
- [ ] Speed control (0.5x, 1x, 2x, 5x, 10x)
- [ ] Time scrubber/slider
- [ ] Current time display

### Playback Synchronization
- [ ] All views sync to playback time
- [ ] Map Viewer updates state during playback
- [ ] Waveform cursor follows playback
- [ ] Log Table scrolls to current time

---

## Phase 4: Bookmarks + Time Sync

### Adding Bookmarks
- [ ] Ctrl+B opens add dialog
- [ ] Enter label and optional description
- [ ] Bookmark at current cursor time
- [ ] Confirmation message
- [ ] Right-click → Add Bookmark

### Bookmark Management
- [ ] Ctrl+Shift+B opens bookmark list
- [ ] Table: timestamp, label, description
- [ ] Sorted by timestamp
- [ ] Edit bookmark
- [ ] Delete bookmark

### Bookmark Navigation
- [ ] Click bookmark → jump to time
- [ ] Ctrl+] → next bookmark
- [ ] Ctrl+[ → previous bookmark
- [ ] Wrap at ends
- [ ] Bookmark markers on time axis

### Time Synchronization (UX Focus)
- [ ] Sync Views button in toolbar (Master/Slave sync)
- [ ] Disabled when no data loaded
- [ ] Dynamic scroll-to-timestamp in Log Table
- [ ] Viewport state synchronization (shared SignalStore)
- [ ] Jump to time from axis click
- [ ] Global "active view" time tracking

---

## Phase 4.5: Multi-File Merge

- [ ] Allow selecting multiple files for upload
- [ ] Merge log entries by timestamp
- [ ] Handle overlapping time ranges
- [ ] Display source file indicator in Log Table
- [ ] Merge signals from multiple files

---

## Phase 5: Validation (Post-MVP)

### Validation Engine
- [ ] Load rules from YAML
- [ ] Sequence validator
- [ ] Timing constraint validator
- [ ] Value range validator

### YAML Editor
- [ ] Editor in sidebar
- [ ] Syntax highlighting
- [ ] Syntax validation on save
- [ ] Save updates rules
- [ ] Reload rules

### Validation Results
- [ ] Results panel with violations list
- [ ] Show: timestamp, rule, device, description
- [ ] Click violation → jump to time
- [ ] Filter by severity

---

## Performance & Stability

- [x] 1GB file uploads successfully (chunked)
- [ ] Parse 1GB file completes (with progress)
- [ ] 100k+ entries in Log Table → smooth scroll
- [ ] 100+ signals in Waveform → smooth pan/zoom
- [x] No browser memory crashes during upload
- [ ] Rapid pane split/merge → no crashes
- [ ] Multiple sessions isolated correctly
