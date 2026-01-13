# PLC Log Visualizer Web - Testing Checklist

This checklist covers manual testing for the web version features.

---

## Phase 1: Foundation & Log Table

### File Upload
- [ ] Drag-drop file onto upload zone → upload starts
- [ ] Click browse and select file → upload starts  
- [ ] Upload file under 1GB → success
- [ ] Upload file over 1GB → error message displayed
- [ ] Upload progress indicator shows percentage
- [ ] Upload completes → file appears in recent files

### Recent Files Panel
- [ ] List shows up to 20 most recent files
- [ ] Each entry shows: filename, size, date, status
- [ ] Click file → loads/parses file
- [ ] Delete button removes file from list
- [ ] List persists across page refresh

### Parsing
- [ ] Parse PLC debug log → entries extracted correctly
- [ ] Parse MCS/AMHS log → signals and carriers detected
- [ ] Parse CSV log → columns parsed correctly
- [ ] Large file (500MB+) → progress shown, no timeout
- [ ] Parse errors → displayed in error panel
- [ ] Parse complete → entry count shown in status bar

### Log Table View
- [ ] Table renders with all columns visible
- [ ] Virtual scroll works with 100k+ rows
- [ ] Scroll performance smooth (no jank)
- [ ] Sort by timestamp (ascending/descending)
- [ ] Sort by device ID
- [ ] Sort by signal name
- [ ] Column resizing works
- [ ] Single row selection (click)
- [ ] Multi-row selection (Shift+click, Ctrl+click)
- [ ] Copy selected rows (Ctrl+C) → clipboard contains data
- [ ] Right-click context menu appears
- [ ] Filter by time range works
- [ ] Search/filter bar filters results in real-time

---

## Phase 2: Waveform/Timing Diagram

### Waveform Rendering
- [ ] Boolean signals render as high/low waveforms
- [ ] String/state signals render as boxes with text
- [ ] Large number of signals (50+) renders without lag
- [ ] Signal transitions marked clearly
- [ ] Colors distinguish different signal values

### Time Axis
- [ ] Time labels show HH:MM:SS.mmm format
- [ ] Tick spacing adjusts on zoom
- [ ] Click on axis jumps to that time
- [ ] Cursor position shows time readout

### Zoom Controls
- [ ] Zoom in button works
- [ ] Zoom out button works
- [ ] Mouse wheel zooms (centered on cursor)
- [ ] Zoom slider works
- [ ] Fit to window button
- [ ] Zoom presets (1s, 10s, 1min, etc.)

### Pan Controls
- [ ] Click and drag to pan
- [ ] Arrow keys pan left/right
- [ ] Go to start button
- [ ] Go to end button
- [ ] Pan is smooth (no jank)

### Time Range Selection
- [ ] Click and drag to select time range
- [ ] Selection highlighted visually
- [ ] Selection shows duration
- [ ] Right-click selection → zoom to selection

### Signal Filtering
- [ ] Search input filters signals in real-time
- [ ] Regex mode toggle works
- [ ] Case-sensitive toggle works
- [ ] Device filter dropdown works
- [ ] Signal type filter (boolean/string/integer)
- [ ] "Show changed" shows only changed signals
- [ ] Save filter preset
- [ ] Load filter preset
- [ ] Delete filter preset

### Signal Labels
- [ ] Labels stick on left side
- [ ] Show Device::SignalName format
- [ ] Color coding by device
- [ ] Click label focuses signal
- [ ] Right-click label shows context menu

---

## Phase 3: Multi-View / Split Panes

### Split Pane Operations
- [ ] Drag tab to top edge → horizontal split
- [ ] Drag tab to bottom edge → horizontal split
- [ ] Drag tab to left edge → vertical split
- [ ] Drag tab to right edge → vertical split
- [ ] Maximum 4 panes enforced (shows warning)
- [ ] Drag splitter to resize panes
- [ ] Resize is smooth

### Tab System
- [ ] New tabs appear in current pane
- [ ] Click between tabs switches content
- [ ] Drag tab between panes works
- [ ] Tab context menu: Close Tab
- [ ] Tab context menu: Close Other Tabs
- [ ] Tab context menu: Close All Tabs
- [ ] Close all tabs in pane → pane merges back

### View Types
- [ ] Open Timing Diagram view (Ctrl+T)
- [ ] Open Log Table view (Ctrl+L)
- [ ] Multiple instances of same type work
- [ ] Each view operates independently

### Layout Persistence
- [ ] Layout saved on change
- [ ] Layout restored on page refresh
- [ ] Reset layout option works

---

## Phase 4: Map Viewer & Carrier Tracking

### Map Rendering
- [ ] Map loads from YAML/XML config
- [ ] Units/stations render as rectangles
- [ ] Paths/conveyors render as lines
- [ ] Labels display correctly
- [ ] Pan and zoom work

### State Visualization
- [ ] State-to-color mapping applied
- [ ] Colors update during playback
- [ ] Color rules from config work

### Carrier Tracking
- [ ] Carriers displayed on units
- [ ] Carrier ID shown (truncated if long)
- [ ] Multi-carrier count shows "2x", "3x"
- [ ] Carrier count colors:
  - [ ] 0: default color
  - [ ] 1: green
  - [ ] 2: yellow
  - [ ] 3: orange
  - [ ] 4+: red gradient

### Unit Interaction
- [ ] Click unit → info panel shows
- [ ] Info shows carrier list
- [ ] Info shows current state
- [ ] Highlight unit by ID works
- [ ] Center view on unit works

### Follow Feature
- [ ] Follow button opens search
- [ ] Fuzzy search matches carriers
- [ ] Multiple matches → selection dialog
- [ ] View follows carrier on move
- [ ] Stop Follow button works

---

## Phase 5: Bookmarks & Time Sync

### Adding Bookmarks
- [ ] Ctrl+B opens bookmark dialog
- [ ] Enter label and optional description
- [ ] Bookmark added at current time
- [ ] Confirmation message shown
- [ ] Right-click → Add Bookmark works

### Bookmark Management
- [ ] Ctrl+Shift+B opens bookmark list
- [ ] Table shows: timestamp, label, description
- [ ] Bookmarks sorted by timestamp
- [ ] Edit bookmark works
- [ ] Delete bookmark works

### Bookmark Navigation
- [ ] Click bookmark → jumps to time
- [ ] Ctrl+] → next bookmark
- [ ] Ctrl+[ → previous bookmark
- [ ] Navigation wraps at ends
- [ ] Bookmark markers on time axis

### Time Synchronization
- [ ] Sync Views button in toolbar
- [ ] Button disabled when no data
- [ ] Click syncs all views to active view's time
- [ ] Timing Diagram syncs time range
- [ ] Log Table scrolls to matching rows
- [ ] Map Viewer updates state

---

## Phase 6: Signal Validation (Post-MVP)

### Validation Engine
- [ ] Load rules from YAML
- [ ] Sequence validator works
- [ ] Timing constraint validator works
- [ ] Value range validator works

### YAML Editor
- [ ] Editor opens in sidebar
- [ ] Syntax highlighting works
- [ ] Syntax validation on save
- [ ] Save updates rules
- [ ] Reload rules works

### Validation Results
- [ ] Results panel lists violations
- [ ] Each shows: timestamp, rule, device, description
- [ ] Click violation → jumps to time
- [ ] Filter by severity works

---

## Performance & Stability

### Large Data Handling
- [ ] 1GB file uploads successfully
- [ ] Parse 1GB file completes (may take time)
- [ ] 100k+ entries in Log Table → smooth scroll
- [ ] 100+ signals in Waveform → smooth pan/zoom
- [ ] No browser memory crashes

### Stress Testing
- [ ] Rapid pane split/merge → no crashes
- [ ] Rapid tab switching → no glitches
- [ ] Quick zoom in/out → no rendering errors
- [ ] Multiple files parsed → sessions isolated

---

## Known Issues

Document issues found:

1. **Issue**: 
   - Steps to reproduce:
   - Expected behavior:
   - Actual behavior:

---

## Test Results Summary

**Date**: ___________  
**Tester**: ___________  
**Total Tests**: ___________  
**Passed**: ___________  
**Failed**: ___________  
**Notes**:
