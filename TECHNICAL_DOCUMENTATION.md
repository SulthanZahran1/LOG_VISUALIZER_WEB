# Technical Documentation

Last updated: 2026-03-08

This repository no longer maintains a single long-form technical document.

Use the smaller source-specific docs instead:
- [README.md](./README.md)
- [API.md](./API.md)
- [backend/README.md](./backend/README.md)
- [backend/UPLOAD_HANDLING.md](./backend/UPLOAD_HANDLING.md)
- [backend/STORAGE.md](./backend/STORAGE.md)
- [frontend/FRONTEND.md](./frontend/FRONTEND.md)
- [frontend/e2e/README.md](./frontend/e2e/README.md)
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
- [BUILD_AIRGAPPED.md](./BUILD_AIRGAPPED.md)

If behavior changes, update the closest doc above instead of expanding this file again.
- `MapRules` with `defaultColor`, `deviceToUnit[]`, `rules[]` (priority-driven color rules).
- `CarrierEntry` with `carrierId`, `location`, `timestamp`, `timestampMs`.

### 4.2 Storage Layers

#### Local file storage (`internal/storage/manager.go`)

- Stores uploaded files under configured upload directory (`UUID` file ids).
- Maintains in-memory metadata index (`map[id]*FileInfo`).
- Supports chunk staging under `uploads/chunks/<uploadId>/chunk_<n>`.
- Assembles chunks into final file on complete.
- Supports list/get/delete/rename and path resolution.

#### Upload processing manager (`internal/upload/manager.go`)

Async job stages:
- `assembling`
- `decompressing` (for gzip)
- `complete` / `error`

Tracks:
- overall progress
- stage and stageProgress
- output file info

#### Session manager (`internal/session/manager.go`)

- Owns active parse sessions and session state.
- Chooses parse path by parser type.
- Parses in goroutine with progress callbacks.
- Supports merged parse sessions and deduplicated merge output.
- Exposes query APIs used by parse handlers.
- Runs cleanup for aged/inactive complete/error sessions.
- Supports keepalive touch semantics.

#### Persistent parsed store (`internal/session/parsedstore.go`)

- Stores parsed DuckDB files in `./data/parsed` (or `PARSED_DB_DIR`).
- File naming pattern: `file_<fileID>.duckdb`.
- Reuses existing parsed DBs when user reopens files.
- Supports orphan cleanup when raw source file no longer exists.

### 4.3 DuckDB-backed Parsed Data Path

`DuckStore` (`internal/parser/duckstore.go`) is the memory-efficient query engine for large datasets.

Schema (`entries` table):
- `id INTEGER PRIMARY KEY`
- `timestamp BIGINT`
- `device_id VARCHAR`
- `signal VARCHAR`
- `category VARCHAR`
- typed value columns:
  - `val_type` (type discriminator)
  - `val_bool`
  - `val_int`
  - `val_float`
  - `val_str`

Ingestion behavior:
- Batched appender flush (`50k` row batches).
- Value encoding into typed columns.
- Tracks unique signals/devices and min/max timestamps.

Finalize behavior:
- Flush remaining batch.
- Create index `idx_ts` always.
- For large datasets (`>100k`), also create:
  - `idx_device`
  - `idx_signal`
  - `idx_signal_ts` (composite for boundary queries).

Query behavior:
- Filter/sort pagination with count cache.
- Keyset/range optimization for deep pagination.
- Cached filtered page-id indexes for repeated paging patterns.
- Concurrency-limited queries via semaphore.

Specialized query APIs:
- `QueryEntries` (filters + pagination)
- `GetChunk` (time range)
- `GetValuesAtTime` (latest values per signal at time)
- `GetBoundaryValues` (before/after boundaries per signal)
- `GetIndexByTime`
- `GetTimeTree`
- `GetCategories`, `GetSignals`, `GetSignalTypes`

### 4.4 Parser Registry and Supported Formats

Parser registry order (`internal/parser/registry.go`):
1. `binary_optimized`
2. `plc_debug`
3. `plc_tab`
4. `mcs_log`
5. `observable_log`
6. `csv_signal`
7. `generic_log`
8. `trs_log`

Auto-detection model:
- Each parser inspects first N non-empty lines.
- Parser chosen when match ratio exceeds parser threshold (commonly `>= 0.6`, generic parser uses lower threshold).

Notable parser behaviors:
- `PLCDebugParser`: fast bracket-index parse path + regex fallback, optimized timestamp parsing, string interning, DuckDB direct parse path.
- `PLCTabParser`: tab-delimited parsing with fast split/index path and type resolution upgrades.
- `CSVSignalParser`: CSV regex + fallback split, type inference with per-signal type resolution.
- `MCSLogParser`: expands one log line into multiple signal entries, normalizes location keys to `CurrentLocation`.
- `ObservableLogParser`: backtick-delimited parser with BOM/NUL normalization and datatype-aware inference.
- `TRSLogParser`: backtick transfer logs, normalized timestamp variant, packs transfer fields into structured string value.
- `BinaryFormatParser`: decodes custom binary format with dictionary and encoded entries.

Map/rules parsers:
- `ParseMapXML`: supports multiple XML roots (`ConveyorMap`, `MapLayout`, `Map`, `.NET Object`) and recursively flattens objects.
- `ParseMapRules`: YAML parser into `MapRules`.

---

## 5. Frontend Components and `@preact/signals` State

### 5.1 App Composition

Main shell (`app.tsx`):
- Health check + initial session restore.
- View tabs (`home`, `log-table`, `waveform`, `map-viewer`, `transitions`, `heatmap`).
- Session actions (sync toggle, clear session, parse merge flow).
- Global bookmark shortcuts.

Views:
- `HomeView`: upload workflows, recent/loaded files, navigation launch.
- `MapViewer`: map/rules/default-map/carrier control surface.
- Dedicated components for log table, waveform, map canvas, transitions, heatmap.

### 5.2 Store Modules (Signals)

#### Log store (`stores/log/*`)

State highlights:
- Session and load state (`currentSession`, `isLoadingLog`, `logError`).
- Entry data (`logEntries`, `totalEntries`, `serverPageOffset`).
- Filters and sorting (`searchQuery`, `categoryFilter`, `signalNameFilter`, `deviceIdFilter`, `sortColumn`, `sortDirection`, regex flags).
- Large-file mode switch (`useServerSide` computed from `entryCount > 100000`).
- Local cache for server pages (`serverPageCache`, 30s TTL, max 10 entries).

Actions highlights:
- Start parse and polling loop.
- Handle completion flow.
- Stream entries for small files (SSE).
- Fetch paginated entries for large files (server-side filters).
- Jump-to-time support via backend index endpoint.

Effects highlights:
- Persist session to local storage.
- Reactively refetch server-side entries on filter/sort changes (debounced).

#### Waveform store (`stores/waveform/*`)

State highlights:
- Viewport (`scrollOffset`, `zoomLevel`, `viewportWidth`, `viewRange`).
- Selected signals and waveform data (`waveformEntries`, `waveformBoundaries`).
- Signal metadata (`allSignals`, `allSignalTypes`, changed-in-view filters).
- UI controls (selection range, loading state, hover state, saved presets).

Actions highlights:
- Signal selection mutators.
- Pan/zoom/jump/zoom-to-selection controls.
- Data fetch strategy:
  - small files: fetch full session once.
  - large files: fetch only viewport chunk + boundaries.

Effects highlights:
- Initialize viewport on new session.
- Fetch signal list/types once session is complete.
- Compute changed signals in current window.
- Auto-refresh waveform data when selected signals or relevant range changes.

#### Map store (`stores/map/*`)

State highlights:
- Layout/rules loading and errors.
- Map transforms (`mapZoom`, `mapOffset`, viewport size).
- Playback (`playbackTime`, `isPlaying`, `playbackSpeed`, range).
- Carrier tracking (`carrierTrackingEnabled`, `carrierLocations`).
- Signal linkage (`latestSignalValues`, `signalHistory`, linked session metadata).
- Server-side map mode computed from linked signal entry count.

Actions highlights:
- Fetch/upload/select map and rules.
- Load default maps and carrier logs.
- Link signal log session to map state.
- Update signal values and carrier location extraction from `CurrentLocation`.
- Playback controls and map-to-waveform sync hooks.

Utils highlights:
- `fitMapToView`, `centerOnUnit`, `centerOnCarrier`.
- Device-to-unit wildcard mapping with regex cache.
- Unit color evaluation (priority rules + value checks + fallback).
- Carrier count/display helpers.

Effects highlights:
- Auto-center followed carrier.
- Push map playback time to waveform when sync enabled.
- For large logs, fetch values-at-time on demand during playback/scrubbing.

### 5.3 Key UI Components

| Domain | Key Components | Role |
|---|---|---|
| File ingest | `FileUpload`, `RecentFiles`, upload hooks | Single/multi upload, drag-drop, paste, progress and merge workflows. |
| Log analysis | `LogTable` + toolbar/subcomponents | Virtualized rows, filtering, sort, selection, jump-to-time, color coding. |
| Waveform | `WaveformView`, `SignalSidebar`, `WaveformCanvas`, `WaveformToolbar`, `TimeSlider` | Signal selection, canvas rendering, pan/zoom/selection, timeline navigation. |
| Map | `MapCanvas`, `MapObjectComponents`, `MapFileSelector`, `MapMediaControls`, `MapFollowControls`, `CarrierPanel`, `MapDetailPanel` | SVG map render, rule coloring, playback, follow mode, carrier status. |
| Additional analytics | `TransitionView`, `TransferHeatmap` | Transition statistics/trends and transfer density visualization. |

---

## 6. Build System (Vite, Makefile, Docker)

### 6.1 Local Development and Build Commands

From project root (`Makefile`):
- `make dev`: run backend and frontend in parallel.
- `make build`: build backend binary and frontend production bundle.
- `make clean`: clean `dist`, `frontend/dist`, `frontend/node_modules`.
- `make test-backend`: run backend tests.
- `make check-frontend`: frontend build check mode.

Direct frontend commands (`frontend/package.json`):
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run test:all`

Direct backend commands:
- `go run cmd/server/main.go`
- `go test ./...`

### 6.2 Frontend Build and Dev Server (Vite)

`frontend/vite.config.ts`:
- Uses `@preact/preset-vite`.
- Proxies `/api` to backend (`VITE_API_PROXY_URL` or `http://localhost:8089`).
- Enables WebSocket proxying for `/api/ws/*`.

Result:
- Frontend runs on Vite (`:5173`) and uses same-origin `/api` path in code.
- Dev proxy removes CORS complexity for local workflow.

### 6.3 Docker and Containerized Runtime

`docker-compose.yml` services:
- `backend`:
  - Built from `backend/Dockerfile`.
  - Exposes `8089`.
  - Mounts data volumes (`uploads`, `temp`).
  - Sets memory-related env vars for large parses (`GOGC`, `GOMEMLIMIT`, `DUCKDB_TEMP_DIR`).
- `frontend`:
  - Built from `frontend/Dockerfile`.
  - Exposes `3000` (served by nginx on port 80 inside container).
  - Depends on backend.

`backend/Dockerfile`:
- Multi-stage build on Debian Bookworm.
- Installs build deps for CGO/DuckDB.
- Builds Go binary with `CGO_ENABLED=1`.
- Runtime image includes CA certs and default map/rules data.

`frontend/Dockerfile`:
- Build stage on `node:20-alpine`.
- Runtime stage on `nginx:alpine`.
- Injects nginx config:
  - SPA fallback routing.
  - `/api` reverse proxy to backend.
  - long read/send/connect timeouts and disabled buffering for large operations.
  - WebSocket upgrade handling for `/api/ws`.

---

## 7. Key Algorithms

### 7.1 Log Parsing Pipeline and Type Inference

Core algorithmic pieces:
- Parser auto-detection by sampling first lines and match-ratio thresholds.
- Format-specific parsing with fast-path tokenization where possible.
- `FastTimestamp` manual parser for fixed timestamp format (avoids `time.Parse` overhead).
- String interning to reduce memory duplication across repeated device/signal/category strings.
- Signal type resolution pass to avoid misclassifying integer signals as boolean when values extend beyond `0/1`.

PLC debug large-file path:
- Parse line-by-line.
- Convert each parsed entry directly into DuckDB batch (`DuckStore.AddEntry`).
- Periodically emit progress and memory diagnostics.
- Finalize by flushing and indexing.

### 7.2 DuckDB Query and Pagination Strategy

`DuckStore.QueryEntries` optimization strategy:
1. Build SQL `WHERE` clause from filters.
2. Use count cache for repeated filter combinations.
3. Use optimized page retrieval path:
   - Fast path for unfiltered timestamp/id sorting: range scan on primary key ids.
   - Filtered path: build and cache ordered id list once, then fetch page rows by id set.
4. Limit concurrent DB queries with semaphore.

Additional time-domain algorithms:
- `GetValuesAtTime`: window function (`ROW_NUMBER() OVER (PARTITION BY ...)`) to get last value per signal.
- `GetBoundaryValues`: two ranked queries for last-before-start and first-after-end.
- `GetTimeTree`: SQL grouping by date/hour/minute buckets.

### 7.3 Waveform Rendering and Continuity

Waveform data strategy:
- Small sessions: fetch complete signal data once.
- Large sessions: fetch only visible time window + boundary values.

Rendering algorithm (canvas):
- Compute visible row range for virtualization from scroll position.
- For each visible signal:
  - Binary-search into entry list (`findFirstIndexAtTime`) to slice visible segment.
  - Render boolean/state waveform segments.
  - Apply boundary value to continue state from left/right edges.
- Overlay selection range, hover cursor/tooltip, bookmark markers, and time axis ticks.

Result:
- Smooth viewport interaction without requiring full dataset in browser memory for large logs.

### 7.4 Map Rendering and Rule Evaluation

Map rendering pipeline:
1. Parse XML into normalized object map.
2. Compute initial fit transform (`fitMapToView`) from object bounding box and viewport dimensions.
3. Render objects in SVG with pan/zoom transforms.
4. For each unit object, resolve color/text via rules and carrier overlays.

Rule evaluation algorithm (`getUnitColor`):
- If carrier-tracking mode active: color by carrier count bucket.
- Else:
  - Sort rules by descending priority.
  - Map rule signal names to relevant device ids for target unit (cached).
  - Read current value (or playback-time historical value in client-side mode).
  - Evaluate comparator (`==`, `!=`, `>`, `>=`, `<`, `<=`) after normalization.
  - Return first matching rule color/text; fallback to default color.

Device mapping algorithm:
- Use explicit `deviceToUnit` mappings with wildcard pattern support (`*` -> cached regex).
- Fallback heuristic strips path/`@` suffix to infer unit id.

### 7.5 Carrier Tracking and Time-Synced Playback

Carrier location update algorithm:
- During signal updates, detect `signalName == "CurrentLocation"`.
- Treat `deviceId` as carrier id.
- Update `carrierLocations[carrierId] = unitId`.
- Maintain derived per-unit carrier counts for map coloring.

Playback algorithm:
- Timer tick advances `playbackTime` by `tickInterval * speed`.
- Clamp to playback range and auto-pause at end.

Large-file server-side map mode:
- Do not rely on full client history.
- Fetch signal state at current playback timestamp via `getValuesAtTime`.
- Throttle fetches during playback and debounce while scrubbing.
- Use generation ids to discard stale async responses.

Follow-mode algorithm:
- If a carrier is marked as followed, map recenters on that carrier's current unit whenever location updates.

---

## 8. Contract and Maintenance Notes

Source-of-truth policy for this project:
1. `backend/cmd/server/main.go` for active backend routes/middleware.
2. `frontend/src/api/client.ts` for frontend API usage contracts.
3. Actual package/component/store structure under `backend/internal` and `frontend/src`.

Recommended maintenance workflow for API changes:
1. Update backend handler behavior.
2. Update route registration.
3. Update frontend client wrappers.
4. Update tests (backend/frontend).
5. Update API/documentation files together.
