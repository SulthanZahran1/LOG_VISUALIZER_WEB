package session

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
)

// MaxSessions limits concurrent sessions to prevent memory exhaustion
const MaxSessions = 10

// SessionMaxAge is how long to keep completed sessions before cleanup
const SessionMaxAge = 30 * time.Minute

// SessionKeepAliveWindow is how long to keep sessions that are actively being used
const SessionKeepAliveWindow = 5 * time.Minute

// Manager handles active log parsing sessions.
type Manager struct {
	sessions    map[string]*SessionState
	mu          sync.RWMutex
	registry    *parser.Registry
	tempDir     string
	parsedStore *PersistentParsedStore
}

// SessionState holds the session metadata and the DuckDB-backed storage.
type SessionState struct {
	Session      *models.ParseSession
	Result       *models.ParsedLog // Legacy: used for backward compatibility with non-DuckDB parsers
	DuckStore    *parser.DuckStore // Memory-efficient storage for large files
	LastAccessed time.Time         // Last time the session was accessed (for keep-alive)
}

// NewManager creates a new session manager.
// Uses environment variable DUCKDB_TEMP_DIR for temp directory, defaults to ./data/temp
func NewManager() *Manager {
	tempDir := os.Getenv("DUCKDB_TEMP_DIR")
	if tempDir == "" {
		tempDir = "./data/temp"
	}
	// Ensure temp directory exists
	os.MkdirAll(tempDir, 0755)
	return NewManagerWithTempDir(tempDir)
}

// NewManagerWithTempDir creates a session manager with a specific temp directory.
func NewManagerWithTempDir(tempDir string) *Manager {
	return &Manager{
		sessions:    make(map[string]*SessionState),
		registry:    parser.GetGlobalRegistry(),
		tempDir:     tempDir,
		parsedStore: NewPersistentParsedStore(),
	}
}

// StartSession begins the parsing process for a file.
// If the file has already been parsed and stored persistently, it will be loaded instantly.
func (m *Manager) StartSession(fileID, filePath string) (*models.ParseSession, error) {
	// Clean up old sessions if at limit
	m.cleanupOldSessionsIfNeeded()

	sessionID := uuid.New().String()

	session := models.NewParseSession(sessionID, fileID)
	session.Status = models.SessionStatusParsing

	state := &SessionState{
		Session:      session,
		LastAccessed: time.Now(),
	}

	m.mu.Lock()
	m.sessions[sessionID] = state
	m.mu.Unlock()

	// Check if this file has already been parsed and stored persistently
	if m.parsedStore.IsParsed(fileID) {
		fmt.Printf("[Session %s] File %s already parsed! Loading from persistent storage...\n",
			shortID(sessionID), shortID(fileID))
		go m.loadFromPersistentStore(sessionID, fileID)
	} else {
		// Run parsing in a background goroutine
		go m.runParse(sessionID, filePath, fileID)
	}

	return session, nil
}

// closeExistingStoresForFile closes DuckStore connections held by other sessions
// for the same file. This prevents DuckDB file locking conflicts on Windows
// when re-opening a previously parsed file.
func (m *Manager) closeExistingStoresForFile(fileID, excludeSessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, state := range m.sessions {
		if id == excludeSessionID {
			continue
		}
		if state.Session.FileID == fileID && state.DuckStore != nil {
			fmt.Printf("[Manager] Closing existing DuckStore for file %s (session %s) to release file lock\n",
				shortID(fileID), shortID(id))
			state.DuckStore.Close()
			state.DuckStore = nil
		}
	}
}

// loadFromPersistentStore loads an already-parsed file from persistent storage.
func (m *Manager) loadFromPersistentStore(sessionID, fileID string) {
	start := time.Now()

	// Close any existing DuckStore connections for the same file
	// to prevent DuckDB file locking conflicts (especially on Windows)
	m.closeExistingStoresForFile(fileID, sessionID)

	// Open the persistent store
	store, err := m.parsedStore.Open(fileID)
	if err != nil {
		fmt.Printf("[Session %s] ERROR loading from persistent store: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("failed to load parsed data: %v", err))
		return
	}

	if store == nil {
		// Should not happen if IsParsed returned true, but handle gracefully
		fmt.Printf("[Session %s] Persistent store returned nil, falling back to re-parse\n", sessionID[:8])
		m.updateSessionError(sessionID, "parsed data not found")
		return
	}

	elapsed := time.Since(start).Milliseconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[sessionID]
	if !ok {
		store.Close()
		return
	}

	state.DuckStore = store
	state.Session.Status = models.SessionStatusComplete
	state.Session.Progress = 100
	state.Session.EntryCount = store.Len()
	state.Session.SignalCount = len(store.GetSignals())
	state.Session.ProcessingTimeMs = elapsed
	state.Session.ParserName = "plc_debug_cached"

	if tr := store.GetTimeRange(); tr != nil {
		state.Session.StartTime = tr.Start.UnixMilli()
		state.Session.EndTime = tr.End.UnixMilli()
	}

	fmt.Printf("[Session %s] Loaded from persistent store in %d ms: %d entries, %d signals\n",
		sessionID[:8], elapsed, store.Len(), len(store.GetSignals()))
}

func (m *Manager) runParse(sessionID, filePath, fileID string) {
	// Recover from panics to prevent backend crash
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("[Parse %s] PANIC recovered: %v\n", sessionID[:8], r)
			m.updateSessionError(sessionID, fmt.Sprintf("parse panicked: %v", r))
		}
		// Clear global intern pool after parse to free memory
		parser.ResetGlobalIntern()
	}()

	start := time.Now()
	fmt.Printf("[Parse %s] Starting parse of %s\n", sessionID[:8], filePath)

	// Verify file existence and size
	if info, err := os.Stat(filePath); err != nil {
		fmt.Printf("[Parse %s] ERROR stat file: %v\n", sessionID[:8], err)
	} else {
		fmt.Printf("[Parse %s] File info: size=%d bytes, mode=%v\n", sessionID[:8], info.Size(), info.Mode())
	}

	p, err := m.registry.FindParser(filePath)
	if err != nil {
		fmt.Printf("[Parse %s] ERROR: failed to find parser: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("failed to find parser: %v", err))
		return
	}

	fmt.Printf("[Parse %s] Using parser: %s\n", sessionID[:8], p.Name())

	m.mu.Lock()
	if state, ok := m.sessions[sessionID]; ok {
		state.Session.Progress = 10
		state.Session.Status = models.SessionStatusParsing
	}
	m.mu.Unlock()

	fmt.Printf("[Parse %s] Beginning parse...\n", sessionID[:8])

	// Progress callback updates session every 100K lines
	progressCb := func(lines int, bytesRead, totalBytes int64) {
		var progress float64
		if totalBytes > 0 {
			progress = 10.0 + float64(bytesRead)*80.0/float64(totalBytes)
		} else {
			progress = 10.0
		}
		// Clamp to 89.9% during parsing (90-100% is for finalization)
		if progress > 89.9 {
			progress = 89.9
		}

		m.mu.Lock()
		if state, ok := m.sessions[sessionID]; ok {
			state.Session.Progress = progress
			// Store lines processed for display
			state.Session.EntryCount = lines
		}
		m.mu.Unlock()

		// Log memory usage every 500K lines
		if lines%500000 == 0 {
			var memStats runtime.MemStats
			runtime.ReadMemStats(&memStats)
			allocMB := float64(memStats.Alloc) / 1024 / 1024
			sysMB := float64(memStats.Sys) / 1024 / 1024
			gcPause := memStats.PauseNs[(memStats.NumGC+255)%256] / 1e6 // Last GC pause in ms
			fmt.Printf("[Parse %s] Progress: %.1f%% (%d lines) - Memory: %.1f MB (alloc) / %.1f MB (sys), Intern: %d, GC Pause: %dms\n",
				sessionID[:8], progress, lines, allocMB, sysMB, parser.GetGlobalIntern().Len(), gcPause)

			// Force GC if memory usage is high (>2GB) to prevent OOM
			if allocMB > 2048 {
				fmt.Printf("[Parse %s] High memory detected, forcing GC...\n", sessionID[:8])
				runtime.GC()
			}
		}
	}

	// Try DuckDB-backed parsing for memory efficiency
	if plcParser, ok := p.(*parser.PLCDebugParser); ok {
		m.runParseToDuckStore(sessionID, filePath, fileID, plcParser, progressCb, start)
		return
	}

	// Fallback to legacy in-memory parsing for other parsers
	result, parseErrors, err := p.ParseWithProgress(filePath, progressCb)
	if err != nil {
		fmt.Printf("[Parse %s] ERROR: parse failed: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("parse failed: %v", err))
		return
	}

	fmt.Printf("[Parse %s] Parse complete: %d entries, %d errors\n", sessionID[:8], len(result.Entries), len(parseErrors))

	elapsed := time.Since(start).Milliseconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[sessionID]
	if !ok {
		return
	}

	state.Result = result
	state.Session.Status = models.SessionStatusComplete
	state.Session.Progress = 100
	state.Session.EntryCount = len(result.Entries)
	state.Session.SignalCount = len(result.Signals)
	state.Session.ProcessingTimeMs = elapsed
	state.Session.ParserName = p.Name()

	if result.TimeRange != nil {
		state.Session.StartTime = result.TimeRange.Start.UnixMilli()
		state.Session.EndTime = result.TimeRange.End.UnixMilli()
	}

	errs := make([]models.ParseError, 0, len(parseErrors))
	for _, e := range parseErrors {
		if e != nil {
			errs = append(errs, *e)
		}
	}
	state.Session.Errors = errs
}

// runParseToDuckStore handles DuckDB-backed parsing for memory efficiency
func (m *Manager) runParseToDuckStore(sessionID, filePath, fileID string, p *parser.PLCDebugParser, progressCb parser.ProgressCallback, start time.Time) {
	// Recover from panics to prevent backend crash
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("[Parse %s] PANIC recovered in DuckStore parse: %v\n", sessionID[:8], r)
			m.updateSessionError(sessionID, fmt.Sprintf("parse panicked: %v", r))
		}
	}()

	// Create persistent DuckStore for this file
	fmt.Printf("[Parse %s] Creating persistent DuckDB store for file %s...\n", shortID(sessionID), shortID(fileID))
	store, err := m.parsedStore.CreateForFile(fileID)
	if err != nil {
		fmt.Printf("[Parse %s] ERROR: failed to create DuckStore: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("failed to create storage: %v", err))
		return
	}
	fmt.Printf("[Parse %s] DuckDB store created, starting parse...\n", sessionID[:8])

	// Parse directly to DuckStore
	parseErrors, err := p.ParseToDuckStore(filePath, store, progressCb)
	if err != nil {
		store.Close()
		m.parsedStore.Delete(fileID) // Clean up on failure
		fmt.Printf("[Parse %s] ERROR: parse failed: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("parse failed: %v", err))
		return
	}

	fmt.Printf("[Parse %s] Parse complete: %d entries (DuckDB), %d errors\n", sessionID[:8], store.Len(), len(parseErrors))

	// Mark as successfully parsed for future reuse
	m.parsedStore.MarkComplete(fileID)
	store.SetPersistent(true) // Don't delete the persistent DB file on session cleanup

	elapsed := time.Since(start).Milliseconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[sessionID]
	if !ok {
		store.Close()
		return
	}

	state.DuckStore = store
	state.Session.Status = models.SessionStatusComplete
	state.Session.Progress = 100
	state.Session.EntryCount = store.Len()
	state.Session.SignalCount = len(store.GetSignals())
	state.Session.ProcessingTimeMs = elapsed
	state.Session.ParserName = p.Name()

	if tr := store.GetTimeRange(); tr != nil {
		state.Session.StartTime = tr.Start.UnixMilli()
		state.Session.EndTime = tr.End.UnixMilli()
	}

	errs := make([]models.ParseError, 0, len(parseErrors))
	for _, e := range parseErrors {
		if e != nil {
			errs = append(errs, *e)
		}
	}
	state.Session.Errors = errs
}

func (m *Manager) updateSessionError(sessionID, reason string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[sessionID]
	if !ok {
		return
	}

	state.Session.Status = models.SessionStatusError
	state.Session.Errors = append(state.Session.Errors, models.ParseError{
		Reason: reason,
	})
}

// cleanupOldSessionsIfNeeded removes oldest completed sessions if at capacity
func (m *Manager) cleanupOldSessionsIfNeeded() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.sessions) < MaxSessions {
		return
	}

	// Find oldest completed/error sessions
	var toDelete []string
	for id, state := range m.sessions {
		if state.Session.Status == models.SessionStatusComplete ||
			state.Session.Status == models.SessionStatusError {
			toDelete = append(toDelete, id)
		}
	}

	// Sort by completion time (we don't track this, so just delete oldest by map order)
	// Delete enough to get below limit
	toFree := len(m.sessions) - MaxSessions + 1
	deleted := 0
	for _, id := range toDelete {
		if deleted >= toFree {
			break
		}
		if state, ok := m.sessions[id]; ok {
			// Close DuckStore to free resources
			if state.DuckStore != nil {
				state.DuckStore.Close()
			}
			delete(m.sessions, id)
			deleted++
			fmt.Printf("[Manager] Cleaned up old session %s to free memory\n", id[:8])
		}
	}
}

// CleanupOldSessions removes sessions older than maxAge,
// but keeps sessions that have been accessed within SessionKeepAliveWindow.
func (m *Manager) CleanupOldSessions(maxAge time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	keepAliveCutoff := time.Now().Add(-SessionKeepAliveWindow)

	for id, state := range m.sessions {
		// Only clean up completed/error sessions
		if state.Session.Status != models.SessionStatusComplete &&
			state.Session.Status != models.SessionStatusError {
			continue
		}

		// Don't clean up sessions that are actively being used
		if state.LastAccessed.After(keepAliveCutoff) {
			continue
		}

		// Check if session is older than maxAge
		// We use LastAccessed if available, otherwise fall back to session creation
		sessionTime := state.LastAccessed
		if sessionTime.IsZero() {
			// Fallback: if LastAccessed not set, use a safe default
			sessionTime = time.Now().Add(-maxAge - time.Hour) // Force cleanup
		}

		if sessionTime.Before(cutoff) {
			if state.DuckStore != nil {
				state.DuckStore.Close()
			}
			delete(m.sessions, id)
			fmt.Printf("[Manager] Cleaned up aged session %s (last accessed: %s ago)\n",
				id[:8], time.Since(state.LastAccessed).Round(time.Second))
		}
	}
}

// GetSession returns a session by ID.
func (m *Manager) GetSession(id string) (*models.ParseSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}
	return state.Session, true
}

// TouchSession updates the LastAccessed timestamp for a session.
// This should be called whenever a session is actively being used
// to prevent it from being cleaned up.
func (m *Manager) TouchSession(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[id]
	if !ok {
		return false
	}
	state.LastAccessed = time.Now()
	return true
}

// QueryEntries returns filtered, sorted and paginated entries for a session.
func (m *Manager) QueryEntries(ctx context.Context, id string, params parser.QueryParams, page, pageSize int) ([]models.LogEntry, int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, 0, false
	}

	// Use DuckStore if available (memory-efficient + filtered)
	if state.DuckStore != nil {
		entries, total, err := state.DuckStore.QueryEntries(ctx, params, page, pageSize)
		if err != nil {
			if err == context.DeadlineExceeded || err == context.Canceled {
				fmt.Printf("[Manager] QueryEntries timeout/cancelled for session %s\n", id[:8])
			} else {
				fmt.Printf("[Manager] QueryEntries error: %v\n", err)
			}
			return nil, 0, false
		}
		return entries, total, true
	}

	// Fallback to legacy in-memory GetEntries (no filtering for simplicity, as legacy is for small files)
	entries, total, ok := m.GetEntries(ctx, id, page, pageSize)
	return entries, total, ok
}

// GetCategories returns all unique categories for a session.
func (m *Manager) GetCategories(ctx context.Context, id string) ([]string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		cats, err := state.DuckStore.GetCategories(ctx)
		if err != nil {
			return nil, false
		}
		return cats, true
	}
	
	// Fallback to legacy in-memory Result (for merged sessions)
	if state.Result != nil {
		catMap := make(map[string]struct{})
		for _, entry := range state.Result.Entries {
			if entry.Category != "" {
				catMap[entry.Category] = struct{}{}
			}
		}
		cats := make([]string, 0, len(catMap))
		for c := range catMap {
			cats = append(cats, c)
		}
		return cats, true
	}
	
	return []string{}, true
}

// GetIndexByTime returns the 0-based index of the first record matching filters where timestamp >= ts.
func (m *Manager) GetIndexByTime(ctx context.Context, id string, params parser.QueryParams, ts int64) (int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return 0, false
	}

	if state.DuckStore != nil {
		index, err := state.DuckStore.GetIndexByTime(ctx, params, ts)
		if err != nil {
			fmt.Printf("[Manager] GetIndexByTime error: %v\n", err)
			return 0, false
		}
		return index, true
	}

	// Legacy mode: linear search (since it's only for small files)
	if state.Result != nil {
		for i, entry := range state.Result.Entries {
			if entry.Timestamp.UnixMilli() >= ts {
				return i, true
			}
		}
		return -1, true
	}

	return 0, false
}

// GetTimeTree returns distinct date/hour/minute combos for the jump-to-time UI.
func (m *Manager) GetTimeTree(ctx context.Context, id string, params parser.QueryParams) ([]parser.TimeTreeEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		entries, err := state.DuckStore.GetTimeTree(ctx, params)
		if err != nil {
			fmt.Printf("[Manager] GetTimeTree error: %v\n", err)
			return nil, false
		}
		return entries, true
	}

	return nil, false
}

// GetEntries returns paginated entries for a session.
func (m *Manager) GetEntries(ctx context.Context, id string, page, pageSize int) ([]models.LogEntry, int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, 0, false
	}

	// Use DuckStore if available (memory-efficient)
	if state.DuckStore != nil {
		total := state.DuckStore.Len()
		offset := (page - 1) * pageSize
		if offset < 0 {
			offset = 0
		}
		if offset >= total {
			return []models.LogEntry{}, total, true
		}

		end := offset + pageSize
		if end > total {
			end = total
		}

		entries, err := state.DuckStore.GetEntries(ctx, offset, end)
		if err != nil {
			return nil, 0, false
		}
		return entries, total, true
	}

	// Fallback to legacy in-memory Result
	if state.Result == nil {
		return nil, 0, false
	}

	total := len(state.Result.Entries)
	start := (page - 1) * pageSize
	if start < 0 {
		start = 0
	}
	if start >= total {
		return []models.LogEntry{}, total, true
	}

	end := start + pageSize
	if end > total {
		end = total
	}

	return state.Result.Entries[start:end], total, true
}

// GetChunk returns entries within a time range for a session.
func (m *Manager) GetChunk(ctx context.Context, id string, startTs, endTs time.Time, signals []string) ([]models.LogEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	// Use DuckStore if available (memory-efficient + indexed)
	if state.DuckStore != nil {
		entries, err := state.DuckStore.GetChunk(ctx, startTs, endTs, signals)
		if err != nil {
			return nil, false
		}
		return entries, true
	}

	// Fallback to legacy in-memory Result (for merged sessions)
	if state.Result != nil {
		startMs := startTs.UnixMilli()
		endMs := endTs.UnixMilli()
		
		var result []models.LogEntry
		for _, entry := range state.Result.Entries {
			ts := entry.Timestamp.UnixMilli()
			if ts < startMs || ts > endMs {
				continue
			}
			
			// Filter by signals if specified
			if len(signals) > 0 {
				key := entry.DeviceID + "::" + entry.SignalName
				found := false
				for _, s := range signals {
					if s == key {
						found = true
						break
					}
				}
				if !found {
					continue
				}
			}
			
			result = append(result, entry)
		}
		return result, true
	}
	
	return []models.LogEntry{}, true
}

// GetValuesAtTime returns signal states at a specific point in time.
func (m *Manager) GetValuesAtTime(ctx context.Context, id string, ts time.Time, signals []string) ([]models.LogEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		entries, err := state.DuckStore.GetValuesAtTime(ctx, ts, signals)
		if err != nil {
			return nil, false
		}
		return entries, true
	}

	// Fallback to legacy in-memory Result (for merged sessions)
	if state.Result != nil {
		tsMs := ts.UnixMilli()
		
		// Find most recent entry for each signal at or before ts
		latest := make(map[string]models.LogEntry)
		
		for _, entry := range state.Result.Entries {
			entryTs := entry.Timestamp.UnixMilli()
			if entryTs > tsMs {
				continue
			}
			
			key := entry.DeviceID + "::" + entry.SignalName
			
			// Filter by signals if specified
			if len(signals) > 0 {
				found := false
				for _, s := range signals {
					if s == key {
						found = true
						break
					}
				}
				if !found {
					continue
				}
			}
			
			// Keep the most recent entry for this signal
			if existing, ok := latest[key]; !ok || entryTs > existing.Timestamp.UnixMilli() {
				latest[key] = entry
			}
		}
		
		// Convert map to slice
		result := make([]models.LogEntry, 0, len(latest))
		for _, entry := range latest {
			result = append(result, entry)
		}
		return result, true
	}

	return []models.LogEntry{}, true
}

// GetBoundaryValues returns the last value before startTs and first value after endTs for each signal.
func (m *Manager) GetBoundaryValues(ctx context.Context, id string, startTs, endTs time.Time, signals []string) (*parser.BoundaryValues, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		boundaries, err := state.DuckStore.GetBoundaryValues(ctx, startTs, endTs, signals)
		if err != nil {
			return nil, false
		}
		return boundaries, true
	}

	// Fallback to legacy in-memory Result (for merged sessions)
	result := &parser.BoundaryValues{
		Before: make(map[string]models.LogEntry),
		After:  make(map[string]models.LogEntry),
	}
	
	if state.Result != nil {
		startMs := startTs.UnixMilli()
		endMs := endTs.UnixMilli()
		
		for _, entry := range state.Result.Entries {
			key := entry.DeviceID + "::" + entry.SignalName
			ts := entry.Timestamp.UnixMilli()
			
			// Filter by signals if specified
			if len(signals) > 0 {
				found := false
				for _, s := range signals {
					if s == key {
						found = true
						break
					}
				}
				if !found {
					continue
				}
			}
			
			// Check if this is the latest entry before startTs
			if ts < startMs {
				if existing, ok := result.Before[key]; !ok || ts > existing.Timestamp.UnixMilli() {
					result.Before[key] = entry
				}
			}
			
			// Check if this is the earliest entry after endTs
			if ts > endMs {
				if existing, ok := result.After[key]; !ok || ts < existing.Timestamp.UnixMilli() {
					result.After[key] = entry
				}
			}
		}
	}
	
	return result, true
}

// GetSignalTypes returns a map of signal key to signal type string for a session.
func (m *Manager) GetSignalTypes(id string) (map[string]string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	// Use DuckStore if available
	if state.DuckStore != nil {
		types, err := state.DuckStore.GetSignalTypes()
		if err != nil {
			return nil, false
		}
		result := make(map[string]string, len(types))
		for k, v := range types {
			result[k] = string(v)
		}
		return result, true
	}

	// Fallback to legacy in-memory Result
	if state.Result == nil {
		return nil, false
	}

	result := make(map[string]string)
	for _, entry := range state.Result.Entries {
		key := entry.DeviceID + "::" + entry.SignalName
		if _, exists := result[key]; !exists {
			result[key] = string(entry.SignalType)
		}
	}
	return result, true
}

// GetSignals returns the full list of signal keys for a session.
func (m *Manager) GetSignals(id string) ([]string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	// Use DuckStore if available
	if state.DuckStore != nil {
		sigMap := state.DuckStore.GetSignals()
		signals := make([]string, 0, len(sigMap))
		for s := range sigMap {
			signals = append(signals, s)
		}
		return signals, true
	}

	// Fallback to legacy in-memory Result
	if state.Result == nil {
		return nil, false
	}

	signals := make([]string, 0, len(state.Result.Signals))
	for s := range state.Result.Signals {
		signals = append(signals, s)
	}

	return signals, true
}

// StartMultiSession begins the parsing process for multiple files and merges them.
func (m *Manager) StartMultiSession(fileIDs []string, filePaths []string) (*models.ParseSession, error) {
	if len(fileIDs) == 0 || len(fileIDs) != len(filePaths) {
		return nil, fmt.Errorf("mismatched fileIDs and filePaths")
	}

	// For single file, delegate to StartSession
	if len(fileIDs) == 1 {
		return m.StartSession(fileIDs[0], filePaths[0])
	}

	sessionID := uuid.New().String()

	// Use first file ID as primary, but indicate merged
	session := models.NewParseSession(sessionID, fileIDs[0])
	session.FileIDs = fileIDs // Store all file IDs for merged sessions
	session.Status = models.SessionStatusParsing

	state := &SessionState{
		Session: session,
	}

	m.mu.Lock()
	m.sessions[sessionID] = state
	m.mu.Unlock()

	// Run parsing in a background goroutine
	go m.runMultiParse(sessionID, fileIDs, filePaths)

	return session, nil
}

func (m *Manager) runMultiParse(sessionID string, fileIDs, filePaths []string) {
	start := time.Now()

	// Parse all files
	parsedLogs := make([]*models.ParsedLog, 0, len(filePaths))
	var allErrors []models.ParseError
	var parserName string

	for i, filePath := range filePaths {
		p, err := m.registry.FindParser(filePath)
		if err != nil {
			m.updateSessionError(sessionID, fmt.Sprintf("failed to find parser for file %d: %v", i, err))
			return
		}

		if parserName == "" {
			parserName = p.Name()
		}

		result, parseErrors, err := p.Parse(filePath)
		if err != nil {
			m.updateSessionError(sessionID, fmt.Sprintf("parse failed for file %d: %v", i, err))
			return
		}

		parsedLogs = append(parsedLogs, result)

		for _, e := range parseErrors {
			if e != nil {
				allErrors = append(allErrors, *e)
			}
		}

		// Update progress
		progress := (float64(i+1) / float64(len(filePaths))) * 80.0
		m.mu.Lock()
		if state, ok := m.sessions[sessionID]; ok {
			state.Session.Progress = progress
		}
		m.mu.Unlock()
	}

	// Merge all parsed logs
	merged := parser.MergeLogs(parsedLogs, fileIDs, parser.DefaultMergeConfig())

	elapsed := time.Since(start).Milliseconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.sessions[sessionID]
	if !ok {
		return
	}

	state.Result = merged
	state.Session.Status = models.SessionStatusComplete
	state.Session.Progress = 100
	state.Session.EntryCount = len(merged.Entries)
	state.Session.SignalCount = len(merged.Signals)
	state.Session.ProcessingTimeMs = elapsed
	state.Session.ParserName = parserName
	state.Session.Errors = allErrors

	if merged.TimeRange != nil {
		state.Session.StartTime = merged.TimeRange.Start.UnixMilli()
		state.Session.EndTime = merged.TimeRange.End.UnixMilli()
	}
}

// DeleteParsedFile removes the parsed DuckDB for a file (call when original file is deleted).
func (m *Manager) DeleteParsedFile(fileID string) error {
	return m.parsedStore.Delete(fileID)
}

// GetParsedStoreStats returns statistics about the persistent parsed store.
func (m *Manager) GetParsedStoreStats() map[string]interface{} {
	return m.parsedStore.Stats()
}

// CleanupOrphanedParsed removes parsed DBs that don't have corresponding raw files.
func (m *Manager) CleanupOrphanedParsed(rawFileIDs []string) int {
	return m.parsedStore.CleanupOrphaned(rawFileIDs)
}
