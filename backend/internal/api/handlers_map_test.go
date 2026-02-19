// handlers_map_test.go - Tests for map handlers
package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/testutil"
)

func TestMapHandler_HandleUploadMapLayout(t *testing.T) {
	tests := []struct {
		name       string
		request    uploadMapRequest
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name: "valid map upload",
			request: uploadMapRequest{
				Name: "factory.xml",
				Data: base64.StdEncoding.EncodeToString([]byte("<map></map>")),
			},
			wantStatus: http.StatusCreated,
			wantErr:    false,
		},
		{
			name: "empty name",
			request: uploadMapRequest{
				Name: "",
				Data: base64.StdEncoding.EncodeToString([]byte("<map></map>")),
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "empty data",
			request: uploadMapRequest{
				Name: "factory.xml",
				Data: "",
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "invalid base64",
			request: uploadMapRequest{
				Name: "factory.xml",
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
			handler := NewMapHandler(store, "./data")

			e := echo.New()
			body, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/map/upload", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleUploadMapLayout(c)

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

				// Verify map was set as current
				if handler.GetCurrentMap() == "" {
					t.Error("expected current map to be set")
				}
			}
		})
	}
}

func TestMapHandler_HandleGetMapLayout(t *testing.T) {
	tests := []struct {
		name       string
		setupMapID string
		wantStatus int
		wantErr    bool
	}{
		{
			name:       "no active map",
			setupMapID: "",
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "with active map - user uploaded",
			setupMapID: "map-123",
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a temp directory for this test
			tempDir, err := os.MkdirTemp("", "map_handler_test")
			if err != nil {
				t.Fatalf("failed to create temp dir: %v", err)
			}
			defer os.RemoveAll(tempDir)

			store := testutil.NewMockStorageWithTempDir(tempDir)
			handler := NewMapHandler(store, tempDir)

			if tt.setupMapID != "" {
				// Add a mock map file with proper ConveyorMap XML format
				validMapXML := `<?xml version="1.0" ?>
<ConveyorMap version="1.0">
  <Object name="TestUnit" type="SmartFactory.SmartCIM.GUI.Widgets.WidgetBelt">
    <Size>120, 40</Size>
    <Location>20, 100</Location>
    <UnitId>TEST001</UnitId>
  </Object>
</ConveyorMap>`
				store.AddFile(tt.setupMapID, "test.xml", []byte(validMapXML))
				handler.SetCurrentMap(tt.setupMapID)
			}

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/map/layout", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err = handler.HandleGetMapLayout(c)

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

				var response map[string]interface{}
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal: %v", err)
					return
				}

				if tt.setupMapID == "" {
					// Should return empty objects
					if _, ok := response["objects"]; !ok {
						t.Error("expected 'objects' in empty response")
					}
				}
			}
		})
	}
}

func TestMapHandler_HandleSetActiveMap(t *testing.T) {
	tests := []struct {
		name       string
		mapID      string
		setupFiles map[string][]byte
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name:  "set valid map",
			mapID: "map-123",
			setupFiles: map[string][]byte{
				"map-123": []byte("<map></map>"),
			},
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "missing map id",
			mapID:      "",
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name:       "non-existent map",
			mapID:      "does-not-exist",
			setupFiles: map[string][]byte{},
			wantStatus: http.StatusNotFound,
			wantErr:    true,
			errCode:    "NOT_FOUND",
		},
		{
			name:       "set default map",
			mapID:      "default:test.xml",
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			for id, data := range tt.setupFiles {
				store.AddFile(id, "test.xml", data)
			}
			handler := NewMapHandler(store, "./data")

			e := echo.New()
			body, _ := json.Marshal(setActiveMapRequest{MapID: tt.mapID})
			req := httptest.NewRequest(http.MethodPost, "/api/map/active", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleSetActiveMap(c)

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

				var response map[string]string
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal: %v", err)
					return
				}

				if response["mapId"] != tt.mapID {
					t.Errorf("expected mapId %s, got %s", tt.mapID, response["mapId"])
				}
			}
		})
	}
}

func TestMapHandler_HandleGetMapRules(t *testing.T) {
	tests := []struct {
		name       string
		setupRules bool
		wantStatus int
		checkNil   bool
	}{
		{
			name:       "no rules set",
			setupRules: false,
			wantStatus: http.StatusOK,
			checkNil:   true,
		},
		{
			name:       "rules set",
			setupRules: true,
			wantStatus: http.StatusOK,
			checkNil:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			handler := NewMapHandler(store, "./data")

			if tt.setupRules {
				rules := &models.MapRules{
					DefaultColor: "#D3D3D3",
				}
				handler.SetCurrentRules("rules-123", rules)
			}

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/map/rules", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleGetMapRules(c)

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

			if tt.checkNil {
				if response["rules"] != nil {
					t.Error("expected nil rules")
				}
			} else {
				if response["rulesId"] != "rules-123" {
					t.Errorf("expected rulesId rules-123, got %v", response["rulesId"])
				}
			}
		})
	}
}

func TestMapHandler_HandleRecentMapFiles(t *testing.T) {
	tests := []struct {
		name     string
		files    map[string]string // id -> filename
		expected int
	}{
		{
			name:     "empty storage",
			files:    map[string]string{},
			expected: 0,
		},
		{
			name: "mixed files",
			files: map[string]string{
				"file1": "log.txt",
				"file2": "map.xml",
				"file3": "rules.yaml",
				"file4": "data.csv",
			},
			expected: 2, // Only XML and YAML
		},
		{
			name: "only map files",
			files: map[string]string{
				"file1": "layout.xml",
				"file2": "config.YAML",
				"file3": "rules.yml",
			},
			expected: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := testutil.NewMockStorage()
			for id, filename := range tt.files {
				store.AddFile(id, filename, []byte("content"))
			}
			handler := NewMapHandler(store, "./data")

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/map/files/recent", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			err := handler.HandleRecentMapFiles(c)

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			var files []models.FileInfo
			if err := json.Unmarshal(rec.Body.Bytes(), &files); err != nil {
				t.Errorf("failed to unmarshal: %v", err)
				return
			}

			if len(files) != tt.expected {
				t.Errorf("expected %d files, got %d", tt.expected, len(files))
			}
		})
	}
}

func TestUploadMapRequest_Validate(t *testing.T) {
	tests := []struct {
		name    string
		request uploadMapRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: uploadMapRequest{Name: "map.xml", Data: "base64data"},
			wantErr: false,
		},
		{
			name:    "empty name",
			request: uploadMapRequest{Name: "", Data: "base64data"},
			wantErr: true,
		},
		{
			name:    "empty data",
			request: uploadMapRequest{Name: "map.xml", Data: ""},
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
