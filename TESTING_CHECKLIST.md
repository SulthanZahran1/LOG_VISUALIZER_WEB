# PLC Log Visualizer Web - Testing Checklist

> Run automated tests first! See [/testing workflow](.agent/workflows/testing.md)

---

## Automated Testing (Run First!)

### Quick Commands (from `frontend/`)

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm run typecheck` | Check TypeScript types | instant |
| `npm run lint` | Check code quality | ~2s |
| `npm run test` | Run unit tests | ~2s |
| `npm run test:e2e` | Run Playwright E2E | ~10s |
| `npm run test:all` | All of above | ~15s |

### Test Files
- **Unit tests**: `src/**/*.test.{ts,tsx}`
- **E2E tests**: `e2e/*.spec.ts`
- **Test setup**: `src/test/setup.ts`

---

## Phase 1: Foundation & Log Table

### File Upload
- [ ] Drag-drop file → upload starts
- [ ] Click browse → upload starts
- [ ] Upload <1GB → success
- [ ] Upload >1GB → chunked upload with progress
- [ ] File appears in recent files on completion

### Recent Files Panel
- [ ] Shows up to 20 recent files
- [ ] Each shows: filename, size, date, status
- [ ] Click file → loads/parses
- [ ] Delete button removes file
- [ ] Persists across refresh

### Parsing
- [ ] PLC debug log parses correctly
- [ ] MCS/AMHS log parses correctly
- [ ] CSV log parses correctly
- [ ] Large file (500MB+) shows progress

### Log Table View
- [ ] Virtual scroll works with 100k+ rows
- [ ] Sort by timestamp/device/signal
- [ ] Column resizing works
- [ ] Multi-row selection (Shift/Ctrl+click)
- [ ] Copy selected rows (Ctrl+C)
- [ ] Filter bar filters in real-time

---

## Phase 2: Waveform/Timing Diagram

### Waveform Rendering
- [ ] Boolean signals → high/low waveforms
- [ ] String/state signals → boxes with text
- [ ] 50+ signals renders without lag
- [ ] Colors distinguish values

### Time Axis
- [ ] Labels: HH:MM:SS.mmm format
- [ ] Tick spacing adjusts on zoom
- [ ] Click axis → jumps to time
- [ ] Cursor position readout

### Zoom Controls
- [ ] Zoom in/out buttons
- [ ] Mouse wheel zoom (centered)
- [ ] Zoom slider
- [ ] Fit to window
- [ ] Zoom presets (1s, 10s, 1min)

### Pan Controls
- [ ] Click-drag to pan
- [ ] Arrow keys pan
- [ ] Go to start/end buttons

### Time Range Selection
- [ ] Shift+drag to select range
- [ ] Selection highlighted
- [ ] Shows duration
- [ ] Zoom to selection button

### Signal Filtering
- [ ] Search input filters signals
- [ ] Regex mode toggle
- [ ] Device collapsible groups
- [ ] Signal type filter (boolean/string/integer)
- [ ] "Show changed" filter works
- [ ] Save/load/delete filter presets

---

## Phase 3: Map Viewer & Carrier Tracking

### Map Rendering
- [x] Map loads from XML config
- [x] Units render as rectangles
- [x] Paths render as lines/arrows
- [x] Labels display correctly
- [x] Pan and zoom work

### Configuration Files
- [x] XML layout upload
- [x] YAML rules upload
- [x] Recent files selection dialog
- [ ] Validate both files before tracking

### Carrier Tracking
- [ ] Carriers displayed on units
- [ ] Carrier ID shown (truncated)
- [ ] Multi-carrier count ("2x", "3x")
- [ ] Color coding: 0=default, 1=green, 2=yellow, 3=orange, 4+=red

### Unit Interaction
- [x] Click unit → highlights
- [ ] Click unit → info panel shows
- [ ] Info shows carrier list
- [x] Center view on unit

---

## Performance & Stability

- [x] 1GB file uploads successfully
- [ ] Parse 1GB file completes
- [ ] 100k+ entries → smooth scroll
- [ ] 100+ signals → smooth pan/zoom
- [x] No browser memory crashes

---

<details>
<summary>Future Phases (Not Yet Implemented)</summary>

## Phase 3.5: Playback
- [ ] Play/pause button
- [ ] Speed control (0.5x–10x)
- [ ] Time scrubber
- [ ] All views sync to playback

## Phase 4: Bookmarks & Time Sync
- [ ] Ctrl+B add bookmark
- [ ] Bookmark list (Ctrl+Shift+B)
- [ ] Jump to bookmark
- [ ] Sync Views button

## Phase 5: Signal Validation
- [ ] Load rules from YAML
- [ ] Sequence/timing validators
- [ ] YAML editor
- [ ] Results panel with violations

</details>
