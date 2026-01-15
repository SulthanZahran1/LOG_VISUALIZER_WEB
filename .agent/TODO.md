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
- [x] Flexible Layout Engine (Tabs + Split Panes)
- [x] Drag-to-split interaction (Left, Right, Top, Bottom)
- [x] Universal Header with: Sync, Clear, Help, Status
- [x] Theme: Industrial Dark (consistent with #003D82 primary blue)
- [x] Breadcrumbs or Navigation Bar for active sessions
- [x] Tabbed View Management (views open as separate tabs)

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

## Phase 2: Waveform/Timing Diagram + Filtering

### Waveform Canvas
- [x] Create WaveformCanvas component (HTML Canvas)
- [x] High-DPI (retina) support
- [x] Visual highlight on selection (cursor line)
- [/] Virtual viewport (render visible time range only)

### Signal Renderers
- [x] BooleanRenderer (high/low waveform)
- [x] StateRenderer (boxes with value text)
- [ ] Transition markers at state changes
- [ ] Color coding per unique value

### Time Axis
- [/] Time labels (HH:MM:SS.mmm format)
- [x] Dynamic tick spacing based on zoom
- [ ] Click axis to jump to time
- [x] Cursor position readout

### Grid Lines
- [x] Vertical grid lines (time intervals)
- [x] Alternating row backgrounds

### Zoom Controls
- [x] Zoom in/out buttons
- [x] Mouse wheel zoom (centered on cursor)
- [ ] Zoom slider
- [x] Fit to window button
- [x] Zoom presets (1s, 10s, 1min, 10min, 1hr)

### Pan Controls
- [x] Click and drag to pan (mouse move)
- [x] Arrow keys navigation
- [x] Go to start/end buttons
- [x] Smooth panning (no jank)

### Time Range Selection
- [ ] Click and drag to select range
- [ ] Visual highlight on selection
- [ ] Show duration of selection
- [ ] Right-click → zoom to selection

### Signal Filtering
- [x] Search input (real-time filtering)
- [x] Regex mode toggle
- [x] Case-sensitive toggle
- [x] Device filter dropdown (via collapsible groups)
- [ ] Signal type filter (boolean/string/integer)
- [ ] "Show changed" filter (signals with changes in view)

### Filter Presets
- [ ] Save current filter as preset
- [ ] Load preset from dropdown
- [ ] Delete preset
- [ ] Store in localStorage

### Signal Labels
- [x] Sticky labels on left side (SignalSidebar)
- [x] Show Device::SignalName format
- [ ] Color coding by device
- [ ] Click label to focus signal
- [ ] "Show changed only" toggle in toolbar
- [x] Sync waveform cursor with Log Table selection
- [x] Jump to time input (HH:MM:SS.mmm format)
- [ ] Right-click context menu (hide, show only, etc.)

---

## Phase 3: Multi-View / Split Panes

### Split Pane Operations (UX Focus)
- [ ] Tabbed interface for multi-view (Home, Log, Timing, Map)
- [ ] Drag-to-split interaction (blue drop zone feedback)
- [ ] Save/Restore split layout configuration
- [ ] Maximum 4 panes restriction (with warning dialog)
- [ ] Pane context menu (Split Horizontal/Vertical, Close)
- [ ] Tabs: Drag between panes, context menu (Close Others, Close All)

---

## Phase 4: Map Viewer + Carrier Tracking

### Map Rendering
- [ ] Load layout from YAML/XML config
- [ ] Render units/stations as rectangles
- [ ] Render paths/conveyors as lines
- [ ] Display labels
- [ ] Pan and zoom controls

### Waveform Canvas (UX Focus)
- [ ] Create WaveformCanvas component (HTML Canvas 2D)
- [ ] High-DPI (retina) support via scaling
- [ ] Virtual viewport (render only visible time range + buffer)
- [ ] Smooth pan (drag) and zoom (scroll)
- [ ] Signal labels (sticky sidebar)
- [ ] Tooltip/Cursor readout for values at time

### Carrier Tracking
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
- [ ] Click unit → show info panel
- [ ] Info panel shows carrier list
- [ ] Info panel shows current state
- [ ] Highlight unit by ID
- [ ] Center view on unit

### Follow Feature
- [ ] Follow button with search input
- [ ] Fuzzy matching for carrier search
- [ ] Selection dialog for multiple matches
- [ ] View follows carrier on move
- [ ] Stop Follow button

---

## Phase 4.5: Playback Feature

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

## Phase 5: Bookmarks + Time Sync

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

## Phase 5.5: Multi-File Merge

- [ ] Allow selecting multiple files for upload
- [ ] Merge log entries by timestamp
- [ ] Handle overlapping time ranges
- [ ] Display source file indicator in Log Table
- [ ] Merge signals from multiple files

---

## Phase 6: Validation (Post-MVP)

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

- [ ] 1GB file uploads successfully
- [ ] Parse 1GB file completes (with progress)
- [ ] 100k+ entries in Log Table → smooth scroll
- [ ] 100+ signals in Waveform → smooth pan/zoom
- [ ] No browser memory crashes
- [ ] Rapid pane split/merge → no crashes
- [ ] Multiple sessions isolated correctly
