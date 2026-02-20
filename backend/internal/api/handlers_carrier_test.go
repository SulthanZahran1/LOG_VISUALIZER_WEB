// handlers_carrier_test.go - Tests for carrier handlers
package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/testutil"
)

func TestCarrierHandler_HandleUploadCarrierLog(t *testing.T) {
	tests := []struct {
		name       string
		request    uploadCarrierLogRequest
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name: "valid carrier log upload",
			request: uploadCarrierLogRequest{
				Name: "carriers.csv",
				Data: base64.StdEncoding.EncodeToString([]byte("carrierId,location,timestamp\nC1,UnitA,12345")),
			},
			wantStatus: http.StatusCreated,
			wantErr:    false,
		},
		{
			name: "empty name",
			request: uploadCarrierLogRequest{
				Name: "",
				Data: base64.StdEncoding.EncodeToString([]byte("data")),
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "empty data",
			request: uploadCarrierLogRequest{
				Name: "carriers.csv",
				Data: "",
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "invalid base64",
			request: uploadCarrierLogRequest{
				Name: "carriers.csv",
				Data: "not-valid!!!",
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "BAD_REQUEST",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			handler := NewCarrierHandler(store)

			e := echo.New()
			body, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/map/carrier-log", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleUploadCarrierLog(c)

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

				// Verify session ID was set
				if handler.GetCarrierSessionID() == "" {
					t.Error("expected carrier session ID to be set")
				}

				// Verify response contains entry count
				var response map[string]interface{}
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal: %v", err)
					return
				}
				if _, ok := response["entries"]; !ok {
					t.Error("expected 'entries' in response")
				}
			}
		})
	}
}

func TestCarrierHandler_HandleGetCarrierLog(t *testing.T) {
	tests := []struct {
		name           string
		setupSession   bool
		wantStatus     int
		hasCarrierData bool
	}{
		{
			name:           "no carrier log uploaded",
			setupSession:   false,
			wantStatus:     http.StatusOK,
			hasCarrierData: false,
		},
		{
			name:           "with carrier log",
			setupSession:   true,
			wantStatus:     http.StatusOK,
			hasCarrierData: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			handler := NewCarrierHandler(store)

			if tt.setupSession {
				// Upload a carrier log first
				store.AddFile("carrier-123", "carriers.csv", []byte("data"))
				handler.SetCarrierSessionID("carrier-123")
			}

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/map/carrier-log", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleGetCarrierLog(c)

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if rec.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
			}

			var response map[string]interface{}
			if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
				t.Errorf("failed to unmarshal: %v", err)
				return
			}

			hasLog, _ := response["hasCarrierLog"].(bool)
			if hasLog != tt.hasCarrierData {
				t.Errorf("expected hasCarrierLog=%v, got %v", tt.hasCarrierData, hasLog)
			}
		})
	}
}

func TestCarrierHandler_HandleGetCarrierEntries(t *testing.T) {
	tests := []struct {
		name         string
		setupSession bool
		queryParams  map[string]string
		wantStatus   int
		wantCount    int
	}{
		{
			name:         "no session returns empty",
			setupSession: false,
			wantStatus:   http.StatusOK,
			wantCount:    0,
		},
		{
			name:         "all entries",
			setupSession: true,
			wantStatus:   http.StatusOK,
			wantCount:    0, // Our mock doesn't add entries
		},
		{
			name:         "with time range filter",
			setupSession: true,
			queryParams: map[string]string{
				"startTime": "0",
				"endTime":   "1000000",
			},
			wantStatus: http.StatusOK,
			wantCount:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			handler := NewCarrierHandler(store)

			if tt.setupSession {
				store.AddFile("carrier-123", "carriers.csv", []byte("data"))
				handler.SetCarrierSessionID("carrier-123")
			}

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/map/carrier-log/entries", nil)

			// Add query params
			q := req.URL.Query()
			for k, v := range tt.queryParams {
				q.Add(k, v)
			}
			req.URL.RawQuery = q.Encode()

			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleGetCarrierEntries(c)

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if rec.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
			}

			var entries []models.CarrierEntry
			if err := json.Unmarshal(rec.Body.Bytes(), &entries); err != nil {
				t.Errorf("failed to unmarshal: %v", err)
				return
			}

			if len(entries) != tt.wantCount {
				t.Errorf("expected %d entries, got %d", tt.wantCount, len(entries))
			}
		})
	}
}

func TestCarrierHandler_SessionManagement(t *testing.T) {
	store := testutil.NewMockStorage()
	handler := NewCarrierHandler(store)

	// Test initial state
	if handler.GetCarrierSessionID() != "" {
		t.Error("expected empty session ID initially")
	}

	// Test setting session ID
	handler.SetCarrierSessionID("test-session-456")
	if handler.GetCarrierSessionID() != "test-session-456" {
		t.Error("session ID not set correctly")
	}

	// Test overwriting session ID
	handler.SetCarrierSessionID("new-session-789")
	if handler.GetCarrierSessionID() != "new-session-789" {
		t.Error("session ID not updated correctly")
	}
}

func TestUploadCarrierLogRequest_Validate(t *testing.T) {
	tests := []struct {
		name    string
		request uploadCarrierLogRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: uploadCarrierLogRequest{Name: "log.csv", Data: "base64data"},
			wantErr: false,
		},
		{
			name:    "empty name",
			request: uploadCarrierLogRequest{Name: "", Data: "base64data"},
			wantErr: true,
		},
		{
			name:    "empty data",
			request: uploadCarrierLogRequest{Name: "log.csv", Data: ""},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.validate()
			if tt.wantErr && err == nil {
				t.Error("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestParseInt64Default(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		defaultVal int64
		expected   int64
	}{
		{
			name:       "valid number",
			input:      "12345",
			defaultVal: 0,
			expected:   12345,
		},
		{
			name:       "invalid number returns default",
			input:      "not-a-number",
			defaultVal: 42,
			expected:   42,
		},
		{
			name:       "empty string returns default",
			input:      "",
			defaultVal: 99,
			expected:   99,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseInt64Default(tt.input, tt.defaultVal)
			if result != tt.expected {
				t.Errorf("expected %d, got %d", tt.expected, result)
			}
		})
	}
}
