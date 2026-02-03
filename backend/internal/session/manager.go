package session

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
)

// Manager handles active log parsing sessions.
type Manager struct {
	sessions map[string]*SessionState
	mu       sync.RWMutex
	registry *parser.Registry
}

// SessionState holds the session metadata and the resulting parsed log.
type SessionState struct {
	Session *models.ParseSession
	Result  *models.ParsedLog
}

// NewManager creates a new session manager.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*SessionState),
		registry: parser.GetGlobalRegistry(),
	}
}

// StartSession begins the parsing process for a file.
func (m *Manager) StartSession(fileID, filePath string) (*models.ParseSession, error) {
	sessionID := uuid.New().String()

	session := models.NewParseSession(sessionID, fileID)
	session.Status = models.SessionStatusParsing

	state := &SessionState{
		Session: session,
	}

	m.mu.Lock()
	m.sessions[sessionID] = state
	m.mu.Unlock()

	// Run parsing in a background goroutine
	go m.runParse(sessionID, filePath)

	return session, nil
}

func (m *Manager) runParse(sessionID, filePath string) {
	start := time.Now()
	
	fmt.Printf("[Parse %s] Starting parse of %s\n", sessionID[:8], filePath)

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
		
		fmt.Printf("[Parse %s] Progress: %.1f%% (%d lines, %d/%d bytes)\n", 
			sessionID[:8], progress, lines, bytesRead, totalBytes)
	}
	
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

	// Convert models.ParseError to non-pointer for the slice if needed
	// (Check models/session.go:22 says []ParseError, but parser returns []*ParseError)
	// Wait, internal/models/session.go:22: Errors []ParseError
	// internal/parser/parser.go:19: []*models.ParseError

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

// GetEntries returns paginated entries for a session.
func (m *Manager) GetEntries(id string, page, pageSize int) ([]models.LogEntry, int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok || state.Result == nil {
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
func (m *Manager) GetChunk(id string, startTs, endTs time.Time) ([]models.LogEntry, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok || state.Result == nil {
		return nil, false
	}

	// Simple linear search for now. Optimize with binary search if needed later.
	entries := make([]models.LogEntry, 0)
	for _, e := range state.Result.Entries {
		if (e.Timestamp.After(startTs) || e.Timestamp.Equal(startTs)) &&
			(e.Timestamp.Before(endTs) || e.Timestamp.Equal(endTs)) {
			entries = append(entries, e)
		}
	}

	return entries, true
}

// GetSignals returns the full list of signal keys for a session.
func (m *Manager) GetSignals(id string) ([]string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	state, ok := m.sessions[id]
	if !ok || state.Result == nil {
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
