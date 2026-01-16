# CHANGELOG.md — What's Been Done

> Append-only log. Add entries at the top.
> Format: `## YYYY-MM-DD: Summary`
> Older entries: [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md)

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
