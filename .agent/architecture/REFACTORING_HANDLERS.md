# Implementation Guide: Backend Handlers Refactoring

> **Target**: Break down `handlers.go` (1,335 lines) into focused modules  
> **Estimated Time**: 2 days  
> **Test Coverage Goal**: 80%+

---

## Current State Analysis

### handlers.go Structure
```go
// Current: God object with mixed responsibilities
type Handler struct {
    store            storage.Store
    session          *session.Manager
    uploadManager    *upload.Manager
    dataDir          string
    currentMapID     string      // Map state
    currentRulesID   string      // Map state
    currentRules     *models.MapRules  // Map state
    carrierSessionID string      // Carrier state
}

// 41 methods covering:
// - File upload (6 methods)
// - Parse/Session (10 methods)
// - Map configuration (8 methods)
// - Carrier tracking (6 methods)
// - WebSocket (4 methods)
// - Utility (7 methods)
```

### Problems
1. **Mixed state**: Map/carrier state shouldn't be in main handler
2. **Hard to test**: No interfaces, tight coupling
3. **Merge conflicts**: Multiple developers touch same file
4. **Cognitive load**: Too much to understand at once

---

## Target Architecture

### Step 1: Extract Interfaces (Day 1 Morning)

```go
// backend/internal/api/interfaces.go
package api

import (
    "github.com/labstack/echo/v4"
    "github.com/plc-visualizer/backend/internal/models"
)

// UploadHandler handles file upload operations
type UploadHandler interface {
    HandleUploadFile(c echo.Context) error
    HandleChunkUpload(c echo.Context) error
    HandleCompleteUpload(c echo.Context) error
    HandleGetRecentFiles(c echo.Context) error
    HandleGetFile(c echo.Context) error
    HandleDeleteFile(c echo.Context) error
}

// ParseHandler handles parsing session operations
type ParseHandler interface {
    HandleStartParse(c echo.Context) error
    HandleParseStatus(c echo.Context) error
    HandleGetEntries(c echo.Context) error
    HandleGetChunk(c echo.Context) error
    HandleGetSignals(c echo.Context) error
    HandleStreamEntries(c echo.Context) error
    HandleKeepAlive(c echo.Context) error
}

// MapHandler handles map configuration operations
type MapHandler interface {
    HandleGetMapLayout(c echo.Context) error
    HandleUploadMap(c echo.Context) error
    HandleGetMapRules(c echo.Context) error
    HandleSetMapRules(c echo.Context) error
    HandleGetRecentMapFiles(c echo.Context) error
    HandleLoadDefaultMap(c echo.Context) error
}

// CarrierHandler handles carrier tracking operations
type CarrierHandler interface {
    HandleUploadCarrierLog(c echo.Context) error
    HandleGetCarrierEntries(c echo.Context) error
    HandleGetCarrierStats(c echo.Context) error
}
```

### Step 2: Create Upload Handler (Day 1 Afternoon)

```go
// backend/internal/api/handlers_upload.go
package api

import (
    "encoding/base64"
    "fmt"
    "net/http"
    "path/filepath"
    "time"

    "github.com/labstack/echo/v4"
    "github.com/plc-visualizer/backend/internal/models"
    "github.com/plc-visualizer/backend/internal/storage"
    "github.com/plc-visualizer/backend/internal/upload"
)

// UploadHandlerImpl implements UploadHandler
type UploadHandlerImpl struct {
    store         storage.Store
    uploadManager *upload.Manager
    dataDir       string
}

// NewUploadHandler creates a new upload handler
func NewUploadHandler(store storage.Store, uploadMgr *upload.Manager, dataDir string) UploadHandler {
    return &UploadHandlerImpl{
        store:         store,
        uploadManager: uploadMgr,
        dataDir:       dataDir,
    }
}

// HandleUploadFile accepts a file as base64 JSON
func (h *UploadHandlerImpl) HandleUploadFile(c echo.Context) error {
    var req uploadFileRequest
    if err := c.Bind(&req); err != nil {
        return newBadRequestError("invalid JSON body", err)
    }

    if err := req.validate(); err != nil {
        return err
    }

    decoded, err := base64.StdEncoding.DecodeString(req.Data)
    if err != nil {
        return newBadRequestError("invalid base64 data", err)
    }

    file := &models.FileInfo{
        ID:        generateFileID(),
        Name:      req.Name,
        Size:      int64(len(decoded)),
        CreatedAt: time.Now(),
    }

    if err := h.store.Save(file.ID, decoded); err != nil {
        return newInternalError("failed to save file", err)
    }

    return c.JSON(http.StatusOK, file)
}

// uploadFileRequest represents an upload request
type uploadFileRequest struct {
    Name string `json:"name"`
    Data string `json:"data"` // Base64-encoded
}

func (r *uploadFileRequest) validate() error {
    if r.Name == "" {
        return newValidationError("name is required")
    }
    if r.Data == "" {
        return newValidationError("data is required")
    }
    return nil
}
```

### Step 3: Error Helpers

```go
// backend/internal/api/errors.go
package api

import (
    "fmt"
    "net/http"

    "github.com/labstack/echo/v4"
)

// APIError represents a structured API error
type APIError struct {
    Status  int    `json:"-"`
    Code    string `json:"code"`
    Message string `json:"message"`
    Details string `json:"details,omitempty"`
}

func (e *APIError) Error() string {
    return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Error constructors for consistent error handling
func newBadRequestError(message string, cause error) *APIError {
    err := &APIError{
        Status:  http.StatusBadRequest,
        Code:    "BAD_REQUEST",
        Message: message,
    }
    if cause != nil {
        err.Details = cause.Error()
    }
    return err
}

func newValidationError(field string) *APIError {
    return &APIError{
        Status:  http.StatusBadRequest,
        Code:    "VALIDATION_ERROR",
        Message: fmt.Sprintf("validation failed for field: %s", field),
    }
}

func newNotFoundError(resource string, id string) *APIError {
    return &APIError{
        Status:  http.StatusNotFound,
        Code:    "NOT_FOUND",
        Message: fmt.Sprintf("%s not found: %s", resource, id),
    }
}

func newInternalError(message string, cause error) *APIError {
    err := &APIError{
        Status:  http.StatusInternalServerError,
        Code:    "INTERNAL_ERROR",
        Message: message,
    }
    if cause != nil {
        err.Details = cause.Error()
    }
    return err
}

// ErrorHandler middleware for Echo
func ErrorHandler(err error, c echo.Context) {
    var apiErr *APIError
    
    switch e := err.(type) {
    case *APIError:
        apiErr = e
    case *echo.HTTPError:
        apiErr = &APIError{
            Status:  e.Code,
            Code:    "HTTP_ERROR",
            Message: fmt.Sprintf("%v", e.Message),
        }
    default:
        apiErr = &APIError{
            Status:  http.StatusInternalServerError,
            Code:    "UNKNOWN_ERROR",
            Message: "An unexpected error occurred",
            Details: err.Error(),
        }
    }

    // Don't expose details in production
    if !isDevelopment() {
        apiErr.Details = ""
    }

    c.JSON(apiErr.Status, apiErr)
}
```

### Step 4: Comprehensive Tests

```go
// backend/internal/api/handlers_upload_test.go
package api

import (
    "bytes"
    "encoding/base64"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/labstack/echo/v4"
    "github.com/plc-visualizer/backend/internal/storage"
    "github.com/plc-visualizer/backend/internal/testutil"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
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
            wantStatus: http.StatusOK,
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
            name: "large file",
            request: uploadFileRequest{
                Name: "large.bin",
                Data: base64.StdEncoding.EncodeToString(make([]byte, 10*1024*1024)), // 10MB
            },
            wantStatus: http.StatusOK,
            wantErr:    false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup
            store := testutil.NewMockStorage()
            handler := NewUploadHandler(store, nil, "./data")

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
                require.Error(t, err)
                apiErr, ok := err.(*APIError)
                require.True(t, ok)
                assert.Equal(t, tt.wantStatus, apiErr.Status)
                assert.Equal(t, tt.errCode, apiErr.Code)
            } else {
                require.NoError(t, err)
                assert.Equal(t, tt.wantStatus, rec.Code)
                
                var response map[string]interface{}
                err = json.Unmarshal(rec.Body.Bytes(), &response)
                require.NoError(t, err)
                assert.NotEmpty(t, response["id"])
                assert.Equal(t, tt.request.Name, response["name"])
            }
        })
    }
}

func TestUploadHandler_HandleGetRecentFiles(t *testing.T) {
    // Setup with pre-existing files
    store := testutil.NewMockStorage()
    store.Files["file1"] = []byte("content1")
    store.Files["file2"] = []byte("content2")
    
    handler := NewUploadHandler(store, nil, "./data")

    e := echo.New()
    req := httptest.NewRequest(http.MethodGet, "/api/files/recent", nil)
    rec := httptest.NewRecorder()
    c := e.NewContext(req, rec)

    // Execute
    err := handler.HandleGetRecentFiles(c)

    // Assert
    require.NoError(t, err)
    assert.Equal(t, http.StatusOK, rec.Code)
    
    var files []map[string]interface{}
    err = json.Unmarshal(rec.Body.Bytes(), &files)
    require.NoError(t, err)
    assert.Len(t, files, 2)
}
```

### Step 5: Mock Storage for Testing

```go
// backend/internal/testutil/mock_storage.go
package testutil

import (
    "errors"
    "sync"
    "time"

    "github.com/plc-visualizer/backend/internal/models"
    "github.com/plc-visualizer/backend/internal/storage"
)

// MockStorage implements storage.Store for testing
type MockStorage struct {
    Files map[string][]byte
    mu    sync.RWMutex
}

// NewMockStorage creates a new mock storage
func NewMockStorage() *MockStorage {
    return &MockStorage{
        Files: make(map[string][]byte),
    }
}

func (m *MockStorage) Save(id string, data []byte) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.Files[id] = data
    return nil
}

func (m *MockStorage) Get(id string) ([]byte, error) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    data, ok := m.Files[id]
    if !ok {
        return nil, errors.New("file not found")
    }
    return data, nil
}

func (m *MockStorage) Delete(id string) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    delete(m.Files, id)
    return nil
}

func (m *MockStorage) List() ([]models.FileInfo, error) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    
    var files []models.FileInfo
    for id, data := range m.Files {
        files = append(files, models.FileInfo{
            ID:        id,
            Name:      id + ".txt",
            Size:      int64(len(data)),
            CreatedAt: time.Now(),
        })
    }
    return files, nil
}

// Ensure MockStorage implements storage.Store
var _ storage.Store = (*MockStorage)(nil)
```

### Step 6: Parse Handler Extraction

```go
// backend/internal/api/handlers_parse.go
package api

import (
    "net/http"
    "strconv"
    "time"

    "github.com/labstack/echo/v4"
    "github.com/plc-visualizer/backend/internal/parser"
    "github.com/plc-visualizer/backend/internal/session"
)

// ParseHandlerImpl implements ParseHandler
type ParseHandlerImpl struct {
    session   *session.Manager
    parser    *parser.Registry
    dataDir   string
}

// NewParseHandler creates a new parse handler
func NewParseHandler(sessionMgr *session.Manager, parserRegistry *parser.Registry, dataDir string) ParseHandler {
    return &ParseHandlerImpl{
        session:   sessionMgr,
        parser:    parserRegistry,
        dataDir:   dataDir,
    }
}

// HandleStartParse starts a new parsing session
func (h *ParseHandlerImpl) HandleStartParse(c echo.Context) error {
    var req startParseRequest
    if err := c.Bind(&req); err != nil {
        return newBadRequestError("invalid request body", err)
    }

    if err := req.validate(); err != nil {
        return err
    }

    session, err := h.session.Create(req.FileIDs, session.Config{
        ParserType: req.ParserType,
        ChunkSize:  req.ChunkSize,
    })
    if err != nil {
        return newInternalError("failed to create session", err)
    }

    // Start parsing asynchronously
    go h.parseAsync(session.ID, req.FileIDs)

    return c.JSON(http.StatusOK, session.ToStatus())
}

// parseAsync performs parsing in background
func (h *ParseHandlerImpl) parseAsync(sessionID string, fileIDs []string) {
    // Implementation
}

// HandleGetEntries returns paginated entries
func (h *ParseHandlerImpl) HandleGetEntries(c echo.Context) error {
    sessionID := c.Param("sessionId")
    
    offset, _ := strconv.Atoi(c.QueryParam("offset"))
    limit, _ := strconv.Atoi(c.QueryParam("limit"))
    if limit == 0 || limit > 1000 {
        limit = 100
    }

    sess, err := h.session.Get(sessionID)
    if err != nil {
        return newNotFoundError("session", sessionID)
    }

    entries, err := sess.GetEntries(offset, limit)
    if err != nil {
        return newInternalError("failed to get entries", err)
    }

    return c.JSON(http.StatusOK, entriesResponse{
        Entries: entries,
        Offset:  offset,
        Limit:   limit,
        Total:   sess.TotalEntries(),
    })
}

// Request/Response types
type startParseRequest struct {
    FileIDs    []string `json:"fileIds"`
    ParserType string   `json:"parserType,omitempty"`
    ChunkSize  int      `json:"chunkSize,omitempty"`
}

func (r *startParseRequest) validate() error {
    if len(r.FileIDs) == 0 {
        return newValidationError("fileIds")
    }
    return nil
}

type entriesResponse struct {
    Entries []models.LogEntry `json:"entries"`
    Offset  int               `json:"offset"`
    Limit   int               `json:"limit"`
    Total   int               `json:"total"`
}
```

---

## Migration Checklist

### Day 1: Setup & Upload Handler
- [ ] Create `interfaces.go` with handler interfaces
- [ ] Create `errors.go` with error helpers
- [ ] Create `handlers_upload.go` with UploadHandlerImpl
- [ ] Create `handlers_upload_test.go` with comprehensive tests
- [ ] Create `testutil/mock_storage.go`
- [ ] Run tests: `go test ./internal/api/... -v`
- [ ] Verify coverage: `go test -cover ./internal/api/...`

### Day 2: Parse Handler & Cleanup
- [ ] Create `handlers_parse.go` with ParseHandlerImpl
- [ ] Create `handlers_parse_test.go` with tests
- [ ] Remove upload/parse methods from original `handlers.go`
- [ ] Update main.go to wire new handlers
- [ ] Run full test suite
- [ ] Update routes registration

---

## Routes Registration (New Pattern)

```go
// backend/cmd/server/main.go
func registerRoutes(e *echo.Echo, deps *Dependencies) {
    // Upload routes
    uploadHandler := api.NewUploadHandler(deps.Store, deps.UploadManager, deps.DataDir)
    uploadGroup := e.Group("/api/files")
    uploadGroup.POST("/upload", uploadHandler.HandleUploadFile)
    uploadGroup.POST("/upload/chunk", uploadHandler.HandleChunkUpload)
    uploadGroup.GET("/recent", uploadHandler.HandleGetRecentFiles)

    // Parse routes
    parseHandler := api.NewParseHandler(deps.SessionManager, deps.ParserRegistry, deps.DataDir)
    parseGroup := e.Group("/api/parse")
    parseGroup.POST("", parseHandler.HandleStartParse)
    parseGroup.GET("/:sessionId/status", parseHandler.HandleParseStatus)
    parseGroup.GET("/:sessionId/entries", parseHandler.HandleGetEntries)
    
    // ... other handlers
}
```

---

## Testing Commands

```bash
# Run all API tests
cd backend && go test ./internal/api/... -v

# With coverage
go test ./internal/api/... -cover

# Generate HTML coverage report
go test ./internal/api/... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

# Race detection
go test ./internal/api/... -race

# Benchmarks
go test ./internal/api/... -bench=.
```

---

## Success Criteria

- [ ] handlers.go < 200 lines
- [ ] Upload handler has 80%+ test coverage
- [ ] Parse handler has 80%+ test coverage
- [ ] All existing tests still pass
- [ ] No regression in API behavior
- [ ] Routes work correctly
