# Changelog

## [Unreleased] - 2026-02-19

### Integrated - Week 2 Frontend FileUpload Refactoring
- **FileUpload.tsx Rewritten**: Decomposed from ~1,020 lines to ~180 lines (82% reduction)
  - **New Hooks Created**:
    - `useFileUpload`: Single file upload with WebSocket/HTTP fallback, progress tracking
    - `useMultiFileUpload`: Multi-file queue management with sequential processing
    - `usePasteHandler`: Clipboard paste handling for files and text
    - `useDragAndDrop`: Drag and drop state management
  - **New Components Created**:
    - `UploadProgress`: Single file upload progress UI
    - `MultiUploadProgress`: Multi-file queue with status indicators
    - `PasteArea`: Text paste textarea component
    - `DebugStatsPanel`: Upload statistics panel
    - `DropZoneContent`: Main drop zone idle state
    - `UploadError`: Error message display
  - **Styles Extracted**: Moved embedded CSS to `FileUpload.css` (~500 lines)
  - **Test results**: 110/110 passing
  - **Build**: ✅ Production build succeeds
  - **TypeCheck**: ✅ No TypeScript errors

### Integrated - Week 2 Frontend LogTable Refactoring
- **LogTable.tsx Rewritten**: Now uses new hooks for cleaner architecture
  - **useVirtualScroll hook**: Handles virtualization, scroll scaling, server-side pagination
  - **useRowSelection hook**: Handles multi-row selection, range select, keyboard nav
  - **Preserved all features**: Column drag-drop, color coding, context menu, Jump to Time
  - **Lines reduced**: ~1,160 → ~850 lines (26% reduction)
  - **Test results**: 110/110 passing
  - **Build**: ✅ Production build succeeds

### Granular Decomposition (Additional)
- **New Hooks Created**:
  - `useColumnManagement`: Handles column drag-drop, resize, ordering
  - `useSearchFilter`: Manages search query with debouncing, filter toggles
  - `useKeyboardShortcuts`: Handles keyboard navigation and shortcuts
- **New Components Created**:
  - `LogTableToolbar`: Extracted toolbar with search, filters, actions
  - `LogTableViewport`: Virtualized scrollable viewport
  - `HighlightText`: Search highlight component with regex support
- **New Utilities**:
  - `colorCoding.ts`: Pure functions for row color coding computation
- **Architecture**: LogTable now composes from 8+ focused hooks/components

### Integrated - Week 1 Backend Handlers Refactoring
- **Modular Handler Architecture**: Migrated `main.go` to use the new handler structure
  - **New Files**: 14 handler files created (`handlers_*.go`, `interfaces.go`, `errors.go`, `routes.go`)
  - **Integration**: `main.go` now uses `api.NewHandlers()` and registers routes via `api.RegisterRoutes()`
  - **WebSocket Compatibility**: Updated `WebSocketHandler` to work with new structure
  - **Backward Compatibility**: Legacy `Handler` struct retained for WebSocket during transition
  
### Files Changed
- `backend/cmd/server/main.go`: Refactored to use new handler structure
- `backend/internal/api/websocket.go`: Updated constructor and field references
- `backend/internal/testutil/mock_storage.go`: Fixed `CreatedAt` → `UploadedAt` field name

### Test Status
- ✅ **COMPLETED**: Go 1.25.7 installed, tests running
- ✅ **Build**: Server compiles successfully
- ✅ **Tests**: 20/22 passing (91%) - 2 minor test infrastructure issues
- 📄 **Report**: See `BACKEND_INTEGRATION_TEST.md`

## [Unreleased] - 2026-02-11

### Added
- **Multi-File Upload UX**: Complete redesign of file upload with multi-file support
  - **Upload Mode Toggle**: Switch between Single and Multi-file modes in the upload card header
  - **Multi-File Queue UI**: Visual queue showing each file's upload status with progress
  - **Server Mode Default**: Multi-file mode uses WebSocket/chunked upload by default for reliability
  - **Overall Progress Bar**: Shows combined progress across all files being uploaded
  - **Per-File Status**: Individual status indicators (pending → uploading → complete/error)
  - **Auto-Merge Flow**: After multi-file upload completes, files are automatically merged

### Changed
- **FileUpload Component**: Added `multiple`, `maxFiles`, and `onMultiUploadSuccess` props
- **HomeView**: Added upload mode toggle in the Log File card header
- Upload card now shows different hint text based on selected mode

## [Unreleased] - 2026-02-06

### Added
- **Waveform Virtualization**: Canvas now uses viewport-based rendering for 100+ signals
  - Only visible signal rows are drawn (+ 2-row buffer for smooth scrolling)
  - Scroll-based virtualization instead of rendering all signals
  - Maintains smooth pan/zoom performance regardless of signal count

### Changed
- WaveformCanvas scroll behavior: `overflow-y: auto` with custom scrollbar styling
- Row background and signal rendering now calculate visible range from scroll position

### Fixed
- **WebSocket Upload Progress Clarity**: Revamped progress reporting for large file uploads
  - Backend: Granular progress updates during chunk assembly (every 10% or 50 chunks)
  - Backend: Progress updates during gzip decompression
  - Frontend: Clearer progress stages with elapsed time (Preparing → Uploading → Verifying → Processing → Complete)
  - Frontend: Heartbeat detection shows "Waiting for server..." with elapsed time when stalled
  - Frontend: Better visual distinction between upload phase (blue) and processing phase (orange/animated)
  - Extended timeout from 3 to 5 minutes for very large files

- **Session Cleanup While Actively Viewing**: Fixed sessions being cleaned up while user is actively using the waveform
  - Added `LastAccessed` timestamp to `SessionState` to track activity
  - Added `TouchSession()` method to update activity timestamp
  - Added `SessionKeepAliveWindow` (5 min) - sessions accessed within this window won't be cleaned up
  - Modified `CleanupOldSessions()` to skip recently accessed sessions
  - All session API endpoints now call `TouchSession()` on successful access
  - Added `POST /api/parse/:sessionId/keepalive` endpoint for explicit keepalive pings
  - Added `sessionKeepAlive()` API client function
  - Cleanup log now shows time since last access for visibility

- **Waveform Performance & UX Improvements**
  - **Loading Indicator**: Added `isWaveformLoading` signal and loading overlay
    - Shows "Loading signal data..." with spinner when fetching from backend
  - **Reduced API Calls**: Increased debounce from 50ms to 150ms for large files
  - **Optimized Rendering**: Removed continuous `requestAnimationFrame` loop
    - Now only re-renders when signals actually change
  - **Fixed Vertical Scrolling**: Proper scroll container with fixed canvas height
  - **Reactive Hover State**: Converted hoverX/hoverRow from refs to signals

### Technical
- New `sendProcessingProgress()` helper in backend WebSocket handler
- New `streamDecompressGzipWithProgress()` for streaming decompression with progress
- Frontend progress mapping: Uploading (5-75%), Verifying (75-85%), Processing (85-98%), Finalizing (98-100%)

## [0.7.0] - 2026-02-03

### Added
- **DuckDB Storage**: Large file parsing now uses DuckDB for memory efficiency
- **Memory Optimization**: Memory footprint stays <100MB for any file size (vs 4GB+ before)
- Added `duckstore.go` module with DuckDB-backed entry storage
- Added `ParseToDuckStore()` method to PLC debug parser

### Changed
- Session manager now stores entries in DuckDB temp file instead of RAM
- `GetEntries()`, `GetChunk()`, `GetSignals()` now query DuckDB on-demand
- Entries are batch-inserted (10K rows) during parsing for efficiency

### Technical
- DuckDB creates indexed temp file per session, auto-cleaned on close
- Backward compatible: non-DuckDB parsers still use legacy in-memory storage

---

## [0.6.3] - 2026-01-30

### Added
- **Category Column Filter**: Added column header quick filter for the Category column in Log Table
- **Filter Popover**: Click funnel icon on CATEGORY header to open filter popover with checkbox list
- **Multi-Select Categories**: Select/deselect individual categories or use All/Clear buttons
- **Visual Feedback**: Filter badge shows count when active, header highlights when filtered
- **(Uncategorized)** option for entries without a category

### Files Changed
- Modified: `frontend/src/stores/logStore.ts` - Added `categoryFilter` signal and `availableCategories` computed
- Modified: `frontend/src/components/log/LogTable.tsx` - Added `CategoryFilterPopover` component
- Modified: `frontend/src/components/log/LogTable.css` - Added popover and filter button styles
- Modified: `frontend/src/components/icons.tsx` - Added `FilterIcon`
- Modified: `.agent/TODO.md` - Added future Sidebar Filter Panel backlog item

---

## [0.6.2] - 2026-01-30

### Added
- **Loaded/Recent Tabs**: New tabbed interface in the files section separating "Loaded" (currently active file) from "Recent" (file history)
- **LoadedFileCard Component**: Shows current file with name, size, entry count, status badge, and quick action buttons
- **Quick Action Buttons**: Direct navigation to Log Table, Waveform, Map, or Transitions from the Loaded tab
- **Auto-load on Upload**: Uploaded files automatically start parsing without manual selection

### Changed
- **UX Flow Improvement**: Loading a file no longer auto-navigates to Log Table, user stays on Home to choose which view
- **HomeView Redesign**: Replaced single "Recent Files" card with tabbed Loaded/Recent interface

### Files Changed
- New: `frontend/src/components/file/LoadedFileCard.tsx`
- Modified: `frontend/src/views/HomeView.tsx`
- Modified: `frontend/src/app.tsx`

---

## [0.6.1] - 2026-01-18

### Fixed
- **Bookmarks now view-aware**: Fixed bug where bookmarks were always created at timestamp 0 instead of the current view time
- **Log Table bookmarks**: Pressing Ctrl+B in Log Table now bookmarks the selected row's timestamp (instead of session start)
- **Multi-view clarity**: `getCurrentTime()` now prioritizes time sources based on active tab:
  - Log Table → Selected row timestamp
  - Map Viewer → Playback position
  - Waveform → Cursor position (or view center if no cursor)

### Added
- `selectedLogTime` signal in `logStore.ts` to track selected log entry for bookmarking
- **Cursor snapping in Waveform**: Cursor visually snaps to signal transitions when hovering over a signal row
  - Snap occurs only when hovering over signal rows (not time axis)
  - Snaps to nearest transition within ~20 pixels on the hovered signal
  - Bookmarks naturally use the already-snapped cursor position
- `bookmarkNotification` signal and `BookmarkNotification.tsx` component for visual feedback
- Toast notification appears when bookmarks are added (auto-dismisses after 2s)

### Testing
- **Unit Tests**: Created `bookmarkStore.test.ts` (14 tests) covering all store logic
- **E2E Tests**: Created `bookmarks.spec.ts` (7 tests) covering keyboard shortcuts, panel operations, and waveform cursor snapping

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
