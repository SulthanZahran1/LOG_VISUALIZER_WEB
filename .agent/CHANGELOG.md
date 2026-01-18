# Changelog

## [0.6.1] - 2026-01-18

### Fixed
- **Bookmarks now view-aware**: Fixed bug where bookmarks were always created at timestamp 0 instead of the current view time
- **Log Table bookmarks**: Pressing Ctrl+B in Log Table now bookmarks the selected row's timestamp (instead of session start)
- **Waveform cursor bookmarks**: Bookmarks now use cursor position (hoverTime) with snap to nearest signal change
- **Multi-view clarity**: `getCurrentTime()` now prioritizes time sources based on active tab:
  - Log Table → Selected row timestamp
  - Map Viewer → Playback position
  - Waveform → Cursor position with signal snap (or view center if no cursor)

### Added
- `selectedLogTime` signal in `logStore.ts` to track selected log entry for bookmarking
- `snapToNearestChange()` function to snap bookmark time to nearest signal transition
- `bookmarkNotification` signal and `BookmarkNotification.tsx` component for visual feedback
- Toast notification appears when bookmarks are added (auto-dismisses after 2s)

---

## [0.6.0] - 2026-01-18

### Added
- **Multi-File Merge**: Select multiple log files to merge into a single session
- **Fuzzy Deduplication**: Entries with same signal/value within 1s are deduplicated
- **SourceID Tracking**: Merged entries track their origin file
- **Ctrl+Click Selection**: Use Ctrl+Click or checkboxes to select multiple files
- **Merge & Visualize Button**: Appears when files are selected

### Backend
- Added `merger.go` with `MergeLogs()` function and deduplication logic
- Added `SourceID` field to `LogEntry` model
- Added `StartMultiSession()` to session manager
- Extended `/api/parse` to accept `fileIds[]` array

### Frontend
- Updated `RecentFiles.tsx` with multi-select mode (Ctrl+Click or checkboxes)
- Added `startParseMerge()` API function
- Wired `onFileMerge` handler in App.tsx and HomeView.tsx

---

## [0.5.0] - 2026-01-17

### Added
- **Bookmarks**: Press Ctrl+B to add time bookmarks, Ctrl+Shift+B to open bookmark panel
- **Bookmark Navigation**: Ctrl+] and Ctrl+[ to jump between bookmarks
- **Bookmark Markers**: Visual markers on waveform canvas (orange flags) and map timeline (dots)
- **Bidirectional Time Sync**: "Sync Views" now propagates time between Waveform and Map viewers

### Changed
- Sync button now uses centralized `bookmarkStore` for state management
- Help modal updated with bookmark keyboard shortcuts

---

## [0.4.0] - 2026-01-17

### Added
- **Map Media Player**: Time-based playback for PLC signals on the map layout.
- **Signal-based Map Coloring**: Units change color based on real-time (or playback-time) signal values.
- **Map Detail Panel**: Side panel showing detailed properties of selected map objects.
- **Recursive Map Parsing**: Support for complex nested `<Object>` tags in XML map layouts.
- **Playback Controls**: Play/pause, skip ±10s, and variable playback speed (0.5x to 10x).

### Changed
- Improved Map Viewer rendering performance using decentralized signal reactivity.
- Optimized map upload to handle large layouts (>10,000 objects) more efficiently.
- Refactored backend server to port 8089 to avoid common conflicts.

### Fixed
- Map loading "500 Internal Server Error" for complex recursive XML structures.
- Carrier tracking state synchronization across application tabs.

## [2026-01-17]
- **Signal Log Integration**: Added "Signal Log (PLC)" section to Map File Selector
- **Use Current Session**: Links log table session data to Map Viewer for time-based coloring
- **UI Enhancement**: Toolbar shows linked signal log status with entry count
- **Map Media Player**: Implemented time-based playback controls (Play/Pause, Skip, Speed, Timeline)
- **Signal History**: Added timestamped signal storage for playback
- **Time-based Coloring**: Map colors now update based on playback time slider position

---

## [2026-01-16]
- **Map Viewer**: Implemented Signal-based Coloring based on YAML rule presets.
- **Carrier Tracking**: Integrated dual log system (PLC + MCS) for real-time carrier position visualization.
- **Carrier Tracking**: Implemented wildcard-based device mapping (`DeviceToUnit`).
- **Carrier Tracking**: Added multi-carrier count badges with color coding and truncated carrier ID display.
- **Carrier Tracking**: Implemented Unit Info Panel to display detailed carrier lists per unit.
- **Validation**: Added state validation to ensure XML Layout and YAML Rules are loaded before enabling tracking.
- **Testing**: Added unit tests for map store logic and verified with full test suite.

---

## 2026-01-16: Markdown Refactoring

### Documentation
- Refactored `CONTEXT.md`: Added quick-start, moved session instructions up, removed duplicates
- Refactored `TODO.md`: Active tasks first, collapsed completed phases
- Created `CHANGELOG_ARCHIVE.md` for older entries
- Updated `TESTING_CHECKLIST.md`: Removed outdated split pane section, collapsed future phases
- Enhanced `SCRATCHPAD.md` with current focus and known issues
- Created `.agent/architecture/` folder with 5 detailed architecture documents:
  - `system-overview.md`, `data-flow.md`, `map-dual-log.md`, `parser-architecture.md`, `state-management.md`

---

## 2026-01-16: Carrier Log Integration (Dual Log System)

### Backend
- Added `carrierSessionID` to Handler for separate carrier log session
- Added `ParserName` to ParseSession model to identify MCS logs
- Added `/api/map/carrier-log` (POST upload, GET status)
- Added `/api/map/carrier-log/entries` for carrier tracking data
- MCS log validation: rejects non-MCS format uploads

### Frontend
- Added `uploadCarrierLog`, `getCarrierLog`, `getCarrierEntries` to API client
- Added carrier log state to mapStore (`carrierLogInfo`, `carrierLogEntries`)
- Added `loadCarrierEntries()` function to populate carrier locations
- Updated `toggleCarrierTracking()` to load carrier data when enabled
- Added carrier log upload section to MapFileSelector dialog
- Shows carrier log status in file selector toolbar

---

## 2026-01-16: Carrier Tracking UI

### Frontend
- Added carrier tracking state to `mapStore.ts`: signals, computed, utilities
- Updated `MapObjectComponents.tsx` with carrier color and text overlay props
- Updated `MapCanvas.tsx` to pass carrier data to components
- Created `CarrierPanel.tsx` for viewing carriers at selected unit
- Added "Tracking ON/OFF" toggle to `MapViewer.tsx` toolbar
- Color coding: green (1), yellow (2), orange (3), red (4+)

---

## 2026-01-16: YAML Rules Parser & File Selection

### Backend
- Created `rules.go` with `MapRules`, `DeviceMapping`, `ColorRule` types
- Created `rules_parser.go` with YAML parsing (uses `gopkg.in/yaml.v3`)
- Added unit tests for YAML parser (2 tests)
- Added `HandleUploadMapRules` and `HandleGetMapRules` handlers
- Added `HandleRecentMapFiles` to list recent XML/YAML files
- Registered routes: `GET/POST /api/map/rules`, `GET /api/map/files/recent`

### Frontend
- Added `uploadMapRules`, `getMapRules`, `getRecentMapFiles` to `client.ts`
- Updated `mapStore.ts` with `mapRules`, `recentMapFiles` signals
- Created `MapFileSelector.tsx` component with dialog UI
- Integrated file selector into `MapViewer.tsx` toolbar

---

## 2026-01-16: Enhanced Paste Support (Forcepoint Bypass)

### Frontend
- Added `onPaste` handler to `FileUpload.tsx` for clipboard file/text paste
- Replaced memory-intensive `readAsText()` with Blob re-wrapping technique
- Large text pastes are now converted directly to `.log` files
- Updated drop zone UI to indicate paste functionality
- Added unit tests for paste handling (`FileUpload.test.tsx`)

---

## 2026-01-15: Chunked Upload Implementation (1GB+ Support)

### Backend
- Implemented `SaveChunk` and `CompleteChunkedUpload` in `LocalStore`
- Added `POST /api/files/upload/chunk` and `POST /api/files/upload/complete`
- Increased server body limit to 1GB using Echo middleware

### Frontend
- Implemented `uploadFileChunked` in `client.ts` with 5MB chunking
- Refactored `FileUpload.tsx` to use chunked uploads for files >5MB
- Optimized memory usage, added visual progress bar

---

## 2026-01-15: Phase 3 — Map Viewer Backend & Initial Frontend

### Backend
- Implemented `MapLayout` and `MapObject` models in Go
- Created `MapXML` parser following reference Python implementation
- Added `GET /api/map/layout` and `POST /api/map/upload` handlers

### Frontend
- Created `mapStore.ts` for map state (layout, zoom, offset, selection)
- Implemented `MapCanvas.tsx` using SVG for performance
- Created modular `MapObjectComponents.tsx` (Belt, Arrow, Label)
- Added `MapViewer` view with toolbar
- Integrated Map Viewer into tabbed layout (v0.2.0)
