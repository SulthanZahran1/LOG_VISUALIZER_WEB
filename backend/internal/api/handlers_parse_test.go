// handlers_parse_test.go - Tests for parse handlers
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/testutil"
)

// MockSessionManager is a mock implementation for testing
type MockSessionManager struct {
	sessions map[string]*models.ParseSession
}

func NewMockSessionManager() *MockSessionManager {
	return &MockSessionManager{
		sessions: make(map[string]*models.ParseSession),
	}
}

func (m *MockSessionManager) StartMultiSession(fileIDs []string, filePaths []string) (*models.ParseSession, error) {
	session := &models.ParseSession{
		ID:      "test-session-123",
		FileIDs: fileIDs,
		Status:  models.SessionStatusPending,
	}
	m.sessions[session.ID] = session
	return session, nil
}

func (m *MockSessionManager) GetSession(id string) (*models.ParseSession, bool) {
	sess, ok := m.sessions[id]
	return sess, ok
}

func (m *MockSessionManager) TouchSession(id string) bool {
	_, ok := m.sessions[id]
	return ok
}

func (m *MockSessionManager) DeleteParsedFile(fileID string) error {
	return nil
}

func (m *MockSessionManager) GetEntries(ctx context.Context, id string, page, pageSize int) ([]models.LogEntry, int, bool) {
	return nil, 0, false
}

func (m *MockSessionManager) QueryEntries(ctx context.Context, id string, params parser.QueryParams, page, pageSize int) ([]models.LogEntry, int, bool) {
	return []models.LogEntry{}, 0, true
}

func (m *MockSessionManager) GetSignals(id string) ([]string, bool) {
	return []string{}, true
}

func (m *MockSessionManager) GetSignalTypes(id string) (map[string]string, bool) {
	return map[string]string{}, true
}

func (m *MockSessionManager) GetCategories(ctx context.Context, id string) ([]string, bool) {
	return []string{}, true
}

func (m *MockSessionManager) GetChunk(ctx context.Context, id string, start, end time.Time, signals []string) ([]models.LogEntry, bool) {
	return []models.LogEntry{}, true
}

func (m *MockSessionManager) GetBoundaryValues(ctx context.Context, id string, start, end time.Time, signals []string) (*parser.BoundaryValues, bool) {
	return &parser.BoundaryValues{Before: make(map[string]models.LogEntry), After: make(map[string]models.LogEntry)}, true
}

func (m *MockSessionManager) GetIndexByTime(ctx context.Context, id string, params parser.QueryParams, ts int64) (int, bool) {
	return 0, true
}

func (m *MockSessionManager) GetTimeTree(ctx context.Context, id string, params parser.QueryParams) ([]parser.TimeTreeEntry, bool) {
	return []parser.TimeTreeEntry{}, true
}

func (m *MockSessionManager) GetValuesAtTime(ctx context.Context, id string, ts time.Time, signals []string) ([]models.LogEntry, bool) {
	return []models.LogEntry{}, true
}

func TestParseHandler_HandleStartParse(t *testing.T) {
	tests := []struct {
		name       string
		request    startParseRequest
		setupFiles map[string][]byte
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name: "single file parse",
			request: startParseRequest{
				FileID: "file-1",
			},
			setupFiles: map[string][]byte{
				"file-1": []byte("log content"),
			},
			wantStatus: http.StatusAccepted,
			wantErr:    false,
		},
		{
			name: "multi file parse",
			request: startParseRequest{
				FileIDs: []string{"file-1", "file-2"},
			},
			setupFiles: map[string][]byte{
				"file-1": []byte("log1"),
				"file-2": []byte("log2"),
			},
			wantStatus: http.StatusAccepted,
			wantErr:    false,
		},
		{
			name:       "no file specified",
			request:    startParseRequest{},
			setupFiles: map[string][]byte{},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "file not found",
			request: startParseRequest{
				FileID: "non-existent",
			},
			setupFiles: map[string][]byte{},
			wantStatus: http.StatusNotFound,
			wantErr:    true,
			errCode:    "NOT_FOUND",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			for id, data := range tt.setupFiles {
				store.AddFile(id, "test.txt", data)
			}
			sessionMgr := NewMockSessionManager()
			handler := NewParseHandler(store, sessionMgr)

			e := echo.New()
			body, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/parse", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			// Execute
			err := handler.HandleStartParse(c)

			// Assert
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
					return
				}
				apiErr, ok := err.(*APIError)
				if !ok {
					t.Errorf("expected APIError, got %T", err)
					return
				}
				if apiErr.Status != tt.wantStatus {
					t.Errorf("expected status %d, got %d", tt.wantStatus, apiErr.Status)
				}
				if apiErr.Code != tt.errCode {
					t.Errorf("expected error code %s, got %s", tt.errCode, apiErr.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
					return
				}
				if rec.Code != tt.wantStatus {
					t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
				}

				var response models.ParseSession
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
					return
				}
				if response.ID == "" {
					t.Error("expected non-empty session ID")
				}
			}
		})
	}
}

func TestParseHandler_HandleParseStatus(t *testing.T) {
	tests := []struct {
		name         string
		sessionID    string
		setupSession *models.ParseSession
		wantStatus   int
		wantErr      bool
		errCode      string
	}{
		{
			name:      "existing session",
			sessionID: "test-session-1",
			setupSession: &models.ParseSession{
				ID:     "test-session-1",
				Status: models.SessionStatusComplete,
			},
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "missing session id",
			sessionID:  "",
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name:       "non-existent session",
			sessionID:  "does-not-exist",
			wantStatus: http.StatusNotFound,
			wantErr:    true,
			errCode:    "NOT_FOUND",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			sessionMgr := NewMockSessionManager()
			if tt.setupSession != nil {
				sessionMgr.sessions[tt.setupSession.ID] = tt.setupSession
			}
			handler := NewParseHandler(store, sessionMgr)

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/parse/:sessionId/status", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetParamNames("sessionId")
			c.SetParamValues(tt.sessionID)

			// Execute
			err := handler.HandleParseStatus(c)

			// Assert
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
					return
				}
				apiErr, ok := err.(*APIError)
				if !ok {
					t.Errorf("expected APIError, got %T", err)
					return
				}
				if apiErr.Code != tt.errCode {
					t.Errorf("expected error code %s, got %s", tt.errCode, apiErr.Code)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
					return
				}
				if rec.Code != tt.wantStatus {
					t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
				}

				var response models.ParseSession
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
					return
				}
				if response.ID != tt.sessionID {
					t.Errorf("expected ID %s, got %s", tt.sessionID, response.ID)
				}
			}
		})
	}
}

func TestParseHandler_HandleSessionKeepAlive(t *testing.T) {
	tests := []struct {
		name         string
		sessionID    string
		setupSession *models.ParseSession
		wantStatus   int
		wantErr      bool
	}{
		{
			name:      "keep alive successful",
			sessionID: "test-session-1",
			setupSession: &models.ParseSession{
				ID: "test-session-1",
			},
			wantStatus: http.StatusNoContent,
			wantErr:    false,
		},
		{
			name:       "missing session id",
			sessionID:  "",
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
		},
		{
			name:       "session not found",
			sessionID:  "does-not-exist",
			wantStatus: http.StatusNotFound,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			sessionMgr := NewMockSessionManager()
			if tt.setupSession != nil {
				sessionMgr.sessions[tt.setupSession.ID] = tt.setupSession
			}
			handler := NewParseHandler(store, sessionMgr)

			e := echo.New()
			req := httptest.NewRequest(http.MethodPost, "/api/parse/:sessionId/keepalive", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetParamNames("sessionId")
			c.SetParamValues(tt.sessionID)

			// Execute
			err := handler.HandleSessionKeepAlive(c)

			// Assert
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
					return
				}
				if rec.Code != tt.wantStatus {
					t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
				}
			}
		})
	}
}

func TestStartParseRequest_NormalizeFileIDs(t *testing.T) {
	tests := []struct {
		name     string
		request  startParseRequest
		expected []string
	}{
		{
			name:     "empty request",
			request:  startParseRequest{},
			expected: nil,
		},
		{
			name: "single file ID",
			request: startParseRequest{
				FileID: "file-1",
			},
			expected: []string{"file-1"},
		},
		{
			name: "multiple file IDs",
			request: startParseRequest{
				FileIDs: []string{"file-1", "file-2", "file-3"},
			},
			expected: []string{"file-1", "file-2", "file-3"},
		},
		{
			name: "both single and multiple - multiple takes precedence",
			request: startParseRequest{
				FileID:  "single-file",
				FileIDs: []string{"multi-1", "multi-2"},
			},
			expected: []string{"multi-1", "multi-2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.request.normalizeFileIDs()
			if len(result) != len(tt.expected) {
				t.Errorf("expected %v, got %v", tt.expected, result)
				return
			}
			for i, v := range tt.expected {
				if result[i] != v {
					t.Errorf("expected %s at index %d, got %s", v, i, result[i])
				}
			}
		})
	}
}

func TestParseTimestamp(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name:    "valid timestamp",
			input:   "1640995200000", // 2022-01-01 00:00:00 UTC
			wantErr: false,
		},
		{
			name:    "invalid timestamp",
			input:   "not-a-number",
			wantErr: true,
		},
		{
			name:    "empty string",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseTimestamp(tt.input)
			if tt.wantErr && err == nil {
				t.Error("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}
