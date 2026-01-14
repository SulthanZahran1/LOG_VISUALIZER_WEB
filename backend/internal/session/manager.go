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

	p, err := m.registry.FindParser(filePath)
	if err != nil {
		m.updateSessionError(sessionID, fmt.Sprintf("failed to find parser: %v", err))
		return
	}

	m.mu.Lock()
	if state, ok := m.sessions[sessionID]; ok {
		state.Session.Progress = 10
	}
	m.mu.Unlock()

	result, parseErrors, err := p.Parse(filePath)
	if err != nil {
		m.updateSessionError(sessionID, fmt.Sprintf("parse failed: %v", err))
		return
	}

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
