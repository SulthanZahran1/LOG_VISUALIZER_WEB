# TODO.md — Task Tracking

> Check off tasks as you complete them. Add new tasks as they arise.
> Corresponds to development phases in CONTEXT.md and test cases in TESTING_CHECKLIST.md.

---

## Phase 1: Foundation + Log Table

### Backend Setup
- [ ] Initialize Go module (`go mod init`)
- [ ] Create `/cmd/server/main.go` entry point
- [ ] Create `/internal/models/` with core types (LogEntry, ParsedLog, Session)
- [ ] Set up Echo/Chi router with CORS

### File Management API
- [ ] `POST /api/files/upload` — accept multipart, 1GB max
- [ ] `GET /api/files/recent` — list 20 most recent
- [ ] `GET /api/files/:id` — file info
- [ ] `DELETE /api/files/:id` — remove from tracking
- [ ] Store file metadata (filename, size, date, status)

### Parser Implementation
- [ ] Define Parser interface (`Parse`, `CanParse`)
- [ ] Implement parser registry with auto-detection
- [ ] Port PLC Debug Parser from Python
- [ ] Port MCS/AMHS Parser from Python  
- [ ] Port CSV Parser from Python
- [ ] Implement chunked parsing for large files (500MB+)
- [ ] Progress tracking during parse

### Parse API
- [ ] `POST /api/parse` — start parsing, return sessionId
- [ ] `GET /api/parse/:sessionId/status` — progress %, entry count
- [ ] `GET /api/parse/:sessionId/entries` — paginated (page, pageSize)
- [ ] `GET /api/parse/:sessionId/chunk` — time-window query

### Frontend Setup
- [ ] Initialize Vite + TypeScript (`npm create vite@latest`)
- [ ] Configure Preact + @preact/signals-core
- [ ] Create industrial dark theme (`theme.css`)
- [ ] Create API client with fetch wrapper
- [ ] Create status bar component

### File Upload Component
- [ ] Drag-drop zone with visual feedback
- [ ] Click to browse file picker
- [ ] Upload progress indicator (percentage)
- [ ] File size validation (reject >1GB)
- [ ] Error message display

### Recent Files Panel
- [ ] List of 20 most recent files
- [ ] Show: filename, size, date, parse status
- [ ] Click to load/parse file
- [ ] Delete button per file
- [ ] Persist list across page refresh

### Session Persistence  
- [ ] Set up IndexedDB for storing parsed session references
- [ ] Restore session on page refresh
- [ ] LRU cleanup (max 5 sessions)

### Log Table View
- [ ] Create VirtualScroll component (fixed row height)
- [ ] Render only visible rows + buffer
- [ ] Columns: Timestamp, Device ID, Signal Name, Value, Type
- [ ] Sort by timestamp (asc/desc)
- [ ] Sort by device ID
- [ ] Sort by signal name
- [ ] Column resizing (drag borders)
- [ ] Single row selection (click)
- [ ] Multi-row selection (Shift+click, Ctrl+click)
- [ ] Copy selected rows (Ctrl+C → clipboard)
- [ ] Right-click context menu
- [ ] Time range filter
- [ ] Search/filter bar (real-time)

---

## Phase 2: Waveform/Timing Diagram + Filtering

### Waveform Canvas
- [ ] Create WaveformCanvas component (HTML Canvas)
- [ ] High-DPI (retina) support
- [ ] Virtual viewport (render visible time range only)

### Signal Renderers
- [ ] BooleanRenderer (high/low waveform)
- [ ] StateRenderer (boxes with value text)
- [ ] Transition markers at state changes
- [ ] Color coding per unique value

### Time Axis
- [ ] Time labels (HH:MM:SS.mmm format)
- [ ] Dynamic tick spacing based on zoom
- [ ] Click axis to jump to time
- [ ] Cursor position readout

### Grid Lines
- [ ] Vertical grid lines (time intervals)
- [ ] Alternating row backgrounds

### Zoom Controls
- [ ] Zoom in/out buttons
- [ ] Mouse wheel zoom (centered on cursor)
- [ ] Zoom slider
- [ ] Fit to window button
- [ ] Zoom presets (1s, 10s, 1min, 10min, 1hr)

### Pan Controls
- [ ] Click and drag to pan
- [ ] Arrow keys navigation
- [ ] Go to start/end buttons
- [ ] Smooth panning (no jank)

### Time Range Selection
- [ ] Click and drag to select range
- [ ] Visual highlight on selection
- [ ] Show duration of selection
- [ ] Right-click → zoom to selection

### Signal Filtering
- [ ] Search input (real-time filtering)
- [ ] Regex mode toggle
- [ ] Case-sensitive toggle
- [ ] Device filter dropdown
- [ ] Signal type filter (boolean/string/integer)
- [ ] "Show changed" filter (signals with changes in view)

### Filter Presets
- [ ] Save current filter as preset
- [ ] Load preset from dropdown
- [ ] Delete preset
- [ ] Store in localStorage

### Signal Labels
- [ ] Sticky labels on left side
- [ ] Show Device::SignalName format
- [ ] Color coding by device
- [ ] Click label to focus signal
- [ ] Right-click context menu (hide, show only, etc.)

---

## Phase 3: Multi-View / Split Panes

### Split Pane Operations
- [ ] Drag tab to top edge → horizontal split
- [ ] Drag tab to bottom edge → horizontal split
- [ ] Drag tab to left edge → vertical split
- [ ] Drag tab to right edge → vertical split
- [ ] Maximum 4 panes enforced (show warning)
- [ ] Drag splitter to resize
- [ ] Smooth resize

### Tab System
- [ ] New tabs appear in current pane
- [ ] Click between tabs to switch
- [ ] Drag tab between panes
- [ ] Tab context menu: Close Tab
- [ ] Tab context menu: Close Other Tabs
- [ ] Tab context menu: Close All Tabs
- [ ] Close all tabs → pane merges back

### View Types
- [ ] Open Timing Diagram (Ctrl+T)
- [ ] Open Log Table (Ctrl+L)
- [ ] Multiple instances of same type
- [ ] Independent operation per view

### Layout Persistence
- [ ] Save layout to localStorage on change
- [ ] Restore layout on page refresh
- [ ] Reset layout option

---

## Phase 4: Map Viewer + Carrier Tracking

### Map Rendering
- [ ] Load layout from YAML/XML config
- [ ] Render units/stations as rectangles
- [ ] Render paths/conveyors as lines
- [ ] Display labels
- [ ] Pan and zoom controls

### State Visualization
- [ ] State-to-color mapping from config
- [ ] Colors update during playback
- [ ] Apply color rules from YAML

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

### Time Synchronization
- [ ] Sync Views button in toolbar
- [ ] Disabled when no data loaded
- [ ] Click syncs all views to active view's time
- [ ] Timing Diagram syncs time range
- [ ] Log Table scrolls to matching rows
- [ ] Map Viewer updates state

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
