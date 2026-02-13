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
- [x] Drag-drop file → upload starts
- [x] Click browse → upload starts
- [x] Upload <1GB → success
- [x] Upload >1GB → chunked upload with progress
- [x] File appears in recent files on completion

### Multi-File Upload
- [x] Upload mode toggle (Single/Multi-file)
- [x] Multi-file queue UI shows per-file status
- [x] Overall progress bar works
- [x] Auto-merge starts after multi-file upload

### Recent Files Panel
- [x] Shows up to 20 recent files
- [x] Each shows: filename, size, date, status
- [x] Click file → loads/parses
- [x] Delete button removes file
- [x] Persists across refresh
- [x] Multi-select for merge (Ctrl+Click, checkboxes)

### Parsing
- [x] PLC debug log parses correctly
- [x] MCS/AMHS log parses correctly
- [x] CSV log parses correctly
- [x] Large file (500MB+) shows progress

### Log Table View
- [x] Virtual scroll works with 100k+ rows
- [x] Sort by timestamp/device/signal
- [x] Column resizing works
- [x] Multi-row selection (Shift/Ctrl+click)
- [x] Copy selected rows (Ctrl+C)
- [x] Filter bar filters in real-time

### Color Coding
- [x] Colors button opens settings panel
- [x] Category color mode works
- [x] Signal pattern matching works
- [x] Value severity detection works (error/warning/info/success)
- [x] Device-based coloring works
- [x] Signal type coloring works (boolean/integer/string)
- [x] Row vs value coloring toggle works
- [x] Settings persist across sessions

---

## Phase 2: Waveform/Timing Diagram

### Waveform Rendering
- [x] Boolean signals → high/low waveforms
- [x] String/state signals → boxes with text
- [x] 50+ signals renders without lag (viewport virtualization)
- [x] 100+ signals → smooth pan/zoom
- [x] Colors distinguish values

### Time Axis
- [x] Labels: HH:MM:SS.mmm format
- [x] Tick spacing adjusts on zoom
- [x] Click axis → jumps to time
- [x] Cursor position readout

### Zoom Controls
- [x] Zoom in/out buttons
- [x] Mouse wheel zoom (centered)
- [x] Zoom slider
- [x] Fit to window
- [x] Zoom presets (1s, 10s, 1min)

### Pan Controls
- [x] Click-drag to pan
- [x] Arrow keys pan
- [x] Go to start/end buttons

### Time Range Selection
- [x] Shift+drag to select range
- [x] Selection highlighted
- [x] Shows duration
- [x] Zoom to selection button

### Signal Filtering
- [x] Search input filters signals
- [x] Regex mode toggle
- [x] Device collapsible groups
- [x] Signal type filter (boolean/string/integer)
- [x] "Show changed" filter works
- [x] Save/load/delete filter presets

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
- [x] Validate both files before tracking

### Carrier Tracking
- [x] Carriers displayed on units
- [x] Carrier ID shown (truncated)
- [x] Multi-carrier count ("2x", "3x")
- [x] Color coding: 0=default, 1=green, 2=yellow, 3=orange, 4+=red

### Unit Interaction
- [x] Click unit → highlights
- [x] Click unit → info panel shows
- [x] Info shows carrier list
- [x] Center view on unit

### Signal-Based Coloring
- [x] Units change color based on signal values
- [x] Color updates during playback
- [x] YAML rules control coloring logic

---

## Phase 3.5: Playback (Media Player)

### Playback Controls
- [x] Play/pause button
- [x] Speed control (0.5x–10x)
- [x] Time scrubber/slider
- [x] Current time display
- [x] Skip forward/backward buttons
- [x] All views sync to playback

---

## Phase 4: Bookmarks & Time Sync

### Bookmark Features
- [x] Ctrl+B add bookmark at current time
- [x] Bookmark list panel (Ctrl+Shift+B)
- [x] Jump to bookmark (Ctrl+] / Ctrl+[)
- [x] Bookmark markers on waveform canvas
- [x] Bookmark markers on map timeline
- [x] View-aware bookmarking:
  - [x] Log Table → selected row timestamp
  - [x] Waveform → cursor position
  - [x] Map → playback position
- [x] Sync Views button (bidirectional time sync)

---

## Phase 5: Multi-File Merge

### Merge Features
- [x] Select multiple files (Ctrl+Click, checkboxes)
- [x] Merge & Visualize button appears
- [x] Fuzzy deduplication (1s window)
- [x] SourceID tracking for merged entries
- [x] Merged session info displayed in UI

---

## Phase 6: Session Management

### Session Keep-Alive
- [x] Sessions stay alive while actively viewing waveform
- [x] 5-minute keep-alive window
- [x] Explicit keepalive via button/endpoint
- [x] No premature cleanup during active use

---

## Performance & Stability

- [x] 1GB file uploads successfully
- [x] Parse 1GB file completes (DuckDB storage)
- [x] 100k+ entries → smooth scroll (virtual scroll)
- [x] 100+ signals → smooth pan/zoom (viewport virtualization)
- [x] No browser memory crashes
- [x] Memory footprint stays <100MB for large files

---

## E2E Tests

### Test Files
- `e2e/bookmarks.spec.ts` - Bookmark keyboard shortcuts, panel operations, cursor snapping
- `e2e/jump-to-time.spec.ts` - Jump to Time feature
- `e2e/log-table.spec.ts` - Log table interactions
- Additional tests in `e2e/*.spec.ts`

### Running E2E Tests
```bash
cd frontend && npm run test:e2e
```

---

<details>
<summary>Future Enhancements (Not Yet Implemented)</summary>

## Phase 7: Signal Validation (Post-MVP)
- [ ] Load validation rules from YAML
- [ ] Sequence, timing, value range validators
- [ ] YAML editor with syntax highlighting
- [ ] Results panel with violation navigation

## Sidebar Filter Panel (Log Table Enhancement)
- [ ] Unified filter panel in sidebar for Log Table
- [ ] Collapsible sections: Categories, Device IDs, Signal Types, Source Files
- [ ] Only show sections with data (e.g., hide Categories if log has none)
- [ ] Consider tabbed approach: Signals | Filters
- [ ] Replaces/supplements current column header filters

</details>
