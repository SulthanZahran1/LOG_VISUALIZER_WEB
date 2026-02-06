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
	sessions map[string]*SessionState
	mu       sync.RWMutex
	registry *parser.Registry
	tempDir  string
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
		sessions: make(map[string]*SessionState),
		registry: parser.GetGlobalRegistry(),
		tempDir:  tempDir,
	}
}

// StartSession begins the parsing process for a file.
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

	// Run parsing in a background goroutine
	go m.runParse(sessionID, filePath)

	return session, nil
}

func (m *Manager) runParse(sessionID, filePath string) {
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
		m.runParseToDuckStore(sessionID, filePath, plcParser, progressCb, start)
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
func (m *Manager) runParseToDuckStore(sessionID, filePath string, p *parser.PLCDebugParser, progressCb parser.ProgressCallback, start time.Time) {
	// Recover from panics to prevent backend crash
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("[Parse %s] PANIC recovered in DuckStore parse: %v\n", sessionID[:8], r)
			m.updateSessionError(sessionID, fmt.Sprintf("parse panicked: %v", r))
		}
	}()

	// Create DuckStore for this session
	fmt.Printf("[Parse %s] Creating DuckDB store in %s...\n", sessionID[:8], m.tempDir)
	store, err := parser.NewDuckStore(m.tempDir, sessionID)
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
		fmt.Printf("[Parse %s] ERROR: parse failed: %v\n", sessionID[:8], err)
		m.updateSessionError(sessionID, fmt.Sprintf("parse failed: %v", err))
		return
	}

	fmt.Printf("[Parse %s] Parse complete: %d entries (DuckDB), %d errors\n", sessionID[:8], store.Len(), len(parseErrors))

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
	entries, total, ok := m.GetEntries(id, page, pageSize)
	return entries, total, ok
}

// GetCategories returns all unique categories for a session.
func (m *Manager) GetCategories(id string) ([]string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		cats, err := state.DuckStore.GetCategories()
		if err != nil {
			return nil, false
		}
		return cats, true
	}

	return []string{}, true
}

// GetEntries returns paginated entries for a session.
func (m *Manager) GetEntries(id string, page, pageSize int) ([]models.LogEntry, int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, 0, false
	}

	// Use DuckStore if available (memory-efficient)
	if state.DuckStore != nil {
		total := state.DuckStore.Len()
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

		entries, err := state.DuckStore.GetEntries(start, end)
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

// GetChunk returns entries within a time window.
// GetChunk returns entries within a time range for a session.
func (m *Manager) GetChunk(id string, startTs, endTs time.Time, signals []string) ([]models.LogEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	// Use DuckStore if available (memory-efficient + indexed)
	if state.DuckStore != nil {
		entries, err := state.DuckStore.GetChunk(startTs, endTs, signals)
		if err != nil {
			return nil, false
		}
		return entries, true
	}

	// Fallback to legacy in-memory Result (not supported for now)
	return []models.LogEntry{}, true
}

// GetValuesAtTime returns the most recent value for all signals at or before the given timestamp.
func (m *Manager) GetValuesAtTime(id string, ts time.Time, signals []string) ([]models.LogEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		entries, err := state.DuckStore.GetValuesAtTime(ts, signals)
		if err != nil {
			return nil, false
		}
		return entries, true
	}

	return []models.LogEntry{}, true
}

// GetBoundaryValues returns the last value before startTs and first value after endTs for each signal.
// This is used by waveform rendering to properly draw signal state continuation.
func (m *Manager) GetBoundaryValues(id string, startTs, endTs time.Time, signals []string) (*parser.BoundaryValues, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok {
		return nil, false
	}

	if state.DuckStore != nil {
		boundaries, err := state.DuckStore.GetBoundaryValues(startTs, endTs, signals)
		if err != nil {
			return nil, false
		}
		return boundaries, true
	}

	// Return empty boundaries for legacy in-memory mode
	return &parser.BoundaryValues{
		Before: make(map[string]models.LogEntry),
		After:  make(map[string]models.LogEntry),
	}, true
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
