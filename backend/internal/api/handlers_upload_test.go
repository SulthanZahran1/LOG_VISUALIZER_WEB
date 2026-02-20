// handlers_upload_test.go - Tests for upload handlers
package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/testutil"
)

func TestUploadHandler_HandleUploadFile(t *testing.T) {
	tests := []struct {
		name       string
		request    uploadFileRequest
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name: "valid file upload",
			request: uploadFileRequest{
				Name: "test.txt",
				Data: base64.StdEncoding.EncodeToString([]byte("hello world")),
			},
			wantStatus: http.StatusCreated,
			wantErr:    false,
		},
		{
			name: "empty name",
			request: uploadFileRequest{
				Name: "",
				Data: base64.StdEncoding.EncodeToString([]byte("content")),
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "empty data",
			request: uploadFileRequest{
				Name: "test.txt",
				Data: "",
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "invalid base64",
			request: uploadFileRequest{
				Name: "test.txt",
				Data: "not-valid-base64!!!",
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "BAD_REQUEST",
		},
		{
			name: "large file upload",
			request: uploadFileRequest{
				Name: "large.bin",
				Data: base64.StdEncoding.EncodeToString(make([]byte, 1024*1024)), // 1MB
			},
			wantStatus: http.StatusCreated,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			body, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			// Execute
			err := handler.HandleUploadFile(c)

			// Assert
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
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

				// Verify response structure
				var response models.FileInfo
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
					return
				}
				if response.ID == "" {
					t.Error("expected non-empty ID in response")
				}
				if response.Name != tt.request.Name {
					t.Errorf("expected name %s, got %s", tt.request.Name, response.Name)
				}
			}
		})
	}
}

func TestUploadHandler_HandleGetRecentFiles(t *testing.T) {
	tests := []struct {
		name       string
		setupFiles map[string][]byte
		wantCount  int
		wantStatus int
		wantErr    bool
	}{
		{
			name:       "empty storage",
			setupFiles: map[string][]byte{},
			wantCount:  0,
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name: "only log files",
			setupFiles: map[string][]byte{
				"file1.txt": []byte("content1"),
				"file2.log": []byte("content2"),
			},
			wantCount:  2,
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name: "mixed files with maps excluded",
			setupFiles: map[string][]byte{
				"log1.txt":   []byte("log content"),
				"map.xml":    []byte("<map/>"),
				"rules.yaml": []byte("rules:"),
				"log2.txt":   []byte("another log"),
			},
			wantCount:  2, // Only log files
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name: "many files limited to 20",
			setupFiles: func() map[string][]byte {
				files := make(map[string][]byte)
				for i := 0; i < 30; i++ {
					files[fmt.Sprintf("file%d.txt", i)] = []byte("content")
				}
				return files
			}(),
			wantCount:  20, // Should be limited
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			for name, data := range tt.setupFiles {
				store.AddFile(fmt.Sprintf("id-%s", name), name, data)
			}
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/files/recent", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			// Execute
			err := handler.HandleGetRecentFiles(c)

			// Assert
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if rec.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, rec.Code)
			}

			var files []models.FileInfo
			if err := json.Unmarshal(rec.Body.Bytes(), &files); err != nil {
				t.Errorf("failed to unmarshal response: %v", err)
				return
			}

			if len(files) != tt.wantCount {
				t.Errorf("expected %d files, got %d", tt.wantCount, len(files))
			}

			// Verify no XML/YAML files in response
			for _, f := range files {
				nameLower := strings.ToLower(f.Name)
				if strings.HasSuffix(nameLower, ".xml") ||
					strings.HasSuffix(nameLower, ".yaml") ||
					strings.HasSuffix(nameLower, ".yml") {
					t.Errorf("found excluded file type: %s", f.Name)
				}
			}
		})
	}
}

func TestUploadHandler_HandleGetFile(t *testing.T) {
	tests := []struct {
		name       string
		fileID     string
		setupFiles map[string][]byte
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name:   "existing file",
			fileID: "test-id-1",
			setupFiles: map[string][]byte{
				"test-id-1": []byte("content"),
			},
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "missing file id",
			fileID:     "",
			setupFiles: map[string][]byte{},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name:       "non-existent file",
			fileID:     "does-not-exist",
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
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/files/:id", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetParamNames("id")
			c.SetParamValues(tt.fileID)

			// Execute
			err := handler.HandleGetFile(c)

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

				var response models.FileInfo
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
					return
				}
				if response.ID != tt.fileID {
					t.Errorf("expected ID %s, got %s", tt.fileID, response.ID)
				}
			}
		})
	}
}

func TestUploadHandler_HandleDeleteFile(t *testing.T) {
	tests := []struct {
		name       string
		fileID     string
		setupFiles map[string][]byte
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name:   "delete existing file",
			fileID: "test-id-1",
			setupFiles: map[string][]byte{
				"test-id-1": []byte("content"),
			},
			wantStatus: http.StatusNoContent,
			wantErr:    false,
		},
		{
			name:       "delete non-existent file",
			fileID:     "does-not-exist",
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
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			req := httptest.NewRequest(http.MethodDelete, "/api/files/:id", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetParamNames("id")
			c.SetParamValues(tt.fileID)

			// Execute
			err := handler.HandleDeleteFile(c)

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

				// Verify file was deleted
				if store.GetFileCount() != 0 {
					t.Error("file should have been deleted")
				}
			}
		})
	}
}

func TestUploadHandler_HandleRenameFile(t *testing.T) {
	tests := []struct {
		name       string
		fileID     string
		newName    string
		setupFiles map[string][]byte
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name:    "rename existing file",
			fileID:  "test-id-1",
			newName: "new-name.txt",
			setupFiles: map[string][]byte{
				"test-id-1": []byte("content"),
			},
			wantStatus: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "rename with empty name",
			fileID:     "test-id-1",
			newName:    "",
			setupFiles: map[string][]byte{},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name:       "rename non-existent file",
			fileID:     "does-not-exist",
			newName:    "new-name.txt",
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
				store.AddFile(id, "old-name.txt", data)
			}
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			body, _ := json.Marshal(renameFileRequest{Name: tt.newName})
			req := httptest.NewRequest(http.MethodPut, "/api/files/:id", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.SetParamNames("id")
			c.SetParamValues(tt.fileID)

			// Execute
			err := handler.HandleRenameFile(c)

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

				var response models.FileInfo
				if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
					return
				}
				if response.Name != tt.newName {
					t.Errorf("expected name %s, got %s", tt.newName, response.Name)
				}
			}
		})
	}
}

func TestUploadHandler_HandleUploadChunk(t *testing.T) {
	tests := []struct {
		name       string
		request    uploadChunkRequest
		wantStatus int
		wantErr    bool
		errCode    string
	}{
		{
			name: "valid chunk upload",
			request: uploadChunkRequest{
				UploadID:    "upload-123",
				ChunkIndex:  0,
				Data:        base64.StdEncoding.EncodeToString([]byte("chunk data")),
				TotalChunks: 5,
			},
			wantStatus: http.StatusAccepted,
			wantErr:    false,
		},
		{
			name: "missing upload id",
			request: uploadChunkRequest{
				UploadID:    "",
				ChunkIndex:  0,
				Data:        base64.StdEncoding.EncodeToString([]byte("data")),
				TotalChunks: 5,
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "missing data",
			request: uploadChunkRequest{
				UploadID:    "upload-123",
				ChunkIndex:  0,
				Data:        "",
				TotalChunks: 5,
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "VALIDATION_ERROR",
		},
		{
			name: "invalid base64",
			request: uploadChunkRequest{
				UploadID:    "upload-123",
				ChunkIndex:  0,
				Data:        "not-valid!!!",
				TotalChunks: 5,
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    true,
			errCode:    "BAD_REQUEST",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			store := testutil.NewMockStorage()
			handler := NewUploadHandler(store, nil, nil)

			e := echo.New()
			body, _ := json.Marshal(tt.request)
			req := httptest.NewRequest(http.MethodPost, "/api/files/upload/chunk", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			// Execute
			err := handler.HandleUploadChunk(c)

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
			}
		})
	}
}

func TestFilterLogFiles(t *testing.T) {
	tests := []struct {
		name     string
		files    []*models.FileInfo
		expected []string // expected file names
	}{
		{
			name:     "empty list",
			files:    []*models.FileInfo{},
			expected: []string{},
		},
		{
			name: "all log files",
			files: []*models.FileInfo{
				{Name: "log1.txt"},
				{Name: "log2.log"},
				{Name: "data.csv"},
			},
			expected: []string{"log1.txt", "log2.log", "data.csv"},
		},
		{
			name: "mixed with maps and rules",
			files: []*models.FileInfo{
				{Name: "log1.txt"},
				{Name: "factory.xml"},
				{Name: "log2.txt"},
				{Name: "rules.yaml"},
				{Name: "config.yml"},
				{Name: "debug.txt"},
			},
			expected: []string{"log1.txt", "log2.txt", "debug.txt"},
		},
		{
			name: "case insensitive filtering",
			files: []*models.FileInfo{
				{Name: "FACTORY.XML"},
				{Name: "Rules.YAML"},
				{Name: "log.txt"},
			},
			expected: []string{"log.txt"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterLogFiles(tt.files)

			if len(result) != len(tt.expected) {
				t.Errorf("expected %d files, got %d", len(tt.expected), len(result))
				return
			}

			for i, expected := range tt.expected {
				if result[i].Name != expected {
					t.Errorf("expected file %d to be %s, got %s", i, expected, result[i].Name)
				}
			}
		})
	}
}
