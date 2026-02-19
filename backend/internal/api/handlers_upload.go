// handlers_upload.go - File upload operation handlers
package api

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
)

// UploadHandlerImpl implements the UploadHandler interface
type UploadHandlerImpl struct {
	store         storage.Store
	sessionMgr    *session.Manager
	uploadManager *upload.Manager
}

// NewUploadHandler creates a new upload handler instance
func NewUploadHandler(store storage.Store, sessionMgr *session.Manager, uploadMgr *upload.Manager) UploadHandler {
	return &UploadHandlerImpl{
		store:         store,
		sessionMgr:    sessionMgr,
		uploadManager: uploadMgr,
	}
}

// HandleUploadFile accepts a file as base64 JSON and saves it to storage
func (h *UploadHandlerImpl) HandleUploadFile(c echo.Context) error {
	var req uploadFileRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid JSON body", err)
	}

	if err := req.validate(); err != nil {
		return err
	}

	// Decode base64 content
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return NewBadRequestError("invalid base64 data", err)
	}

	// Save file to storage
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return NewInternalError("failed to save file", err)
	}

	return c.JSON(http.StatusCreated, info)
}

// HandleUploadChunk accepts a single chunk of a chunked upload
func (h *UploadHandlerImpl) HandleUploadChunk(c echo.Context) error {
	var req uploadChunkRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid JSON body", err)
	}

	if err := req.validate(); err != nil {
		return err
	}

	// Decode base64 chunk data
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return NewBadRequestError("invalid base64 data", err)
	}

	// Save chunk
	if err := h.store.SaveChunkBytes(req.UploadID, req.ChunkIndex, decoded); err != nil {
		return NewInternalError("failed to save chunk", err)
	}

	return c.NoContent(http.StatusAccepted)
}

// HandleCompleteUpload completes a chunked upload and starts async processing
func (h *UploadHandlerImpl) HandleCompleteUpload(c echo.Context) error {
	var req completeUploadRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	if err := req.validate(); err != nil {
		return err
	}

	// Start async processing job
	job := h.uploadManager.StartJob(
		req.UploadID,
		req.Name,
		req.TotalChunks,
		req.OriginalSize,
		req.CompressedSize,
		req.Encoding,
	)

	return c.JSON(http.StatusAccepted, map[string]interface{}{
		"jobId":  job.ID,
		"status": job.Status,
	})
}

// HandleUploadBinary accepts raw binary file upload (multipart/form-data)
func (h *UploadHandlerImpl) HandleUploadBinary(c echo.Context) error {
	// Get file from form
	file, err := c.FormFile("file")
	if err != nil {
		return NewBadRequestError("no file provided", err)
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		return NewInternalError("failed to open uploaded file", err)
	}
	defer src.Close()

	// Save to storage
	info, err := h.store.Save(file.Filename, src)
	if err != nil {
		return NewInternalError("failed to save file", err)
	}

	return c.JSON(http.StatusCreated, info)
}

// HandleGetRecentFiles returns a list of recently uploaded log files
func (h *UploadHandlerImpl) HandleGetRecentFiles(c echo.Context) error {
	files, err := h.store.List(50)
	if err != nil {
		return NewInternalError("failed to list files", err)
	}

	// Filter to only log files (exclude maps and rules)
	logFiles := filterLogFiles(files)

	// Limit to 20 after filtering
	if len(logFiles) > 20 {
		logFiles = logFiles[:20]
	}

	return c.JSON(http.StatusOK, logFiles)
}

// HandleGetFile returns metadata for a specific file
func (h *UploadHandlerImpl) HandleGetFile(c echo.Context) error {
	id := c.Param("id")
	if id == "" {
		return NewValidationError("id")
	}

	info, err := h.store.Get(id)
	if err != nil {
		return NewNotFoundError("file", id)
	}

	return c.JSON(http.StatusOK, info)
}

// HandleDeleteFile deletes a file and its associated parsed data
func (h *UploadHandlerImpl) HandleDeleteFile(c echo.Context) error {
	id := c.Param("id")
	if id == "" {
		return NewValidationError("id")
	}

	if err := h.store.Delete(id); err != nil {
		return NewNotFoundError("file", id)
	}

	// Clean up associated parsed data
	if h.sessionMgr != nil {
		h.sessionMgr.DeleteParsedFile(id)
	}

	return c.NoContent(http.StatusNoContent)
}

// HandleRenameFile updates the name of a file
func (h *UploadHandlerImpl) HandleRenameFile(c echo.Context) error {
	id := c.Param("id")
	if id == "" {
		return NewValidationError("id")
	}

	var req renameFileRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	if req.Name == "" {
		return NewValidationError("name")
	}

	info, err := h.store.Rename(id, req.Name)
	if err != nil {
		return NewNotFoundError("file", id)
	}

	return c.JSON(http.StatusOK, info)
}

// HandleUploadJobStream streams upload job status via SSE
// TODO: Implement proper upload job streaming
func (h *UploadHandlerImpl) HandleUploadJobStream(c echo.Context) error {
	// Stub implementation - returns not implemented
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	
	fmt.Fprintf(c.Response(), "data: %s\n\n", `{"status":"pending","progress":0}`)
	c.Response().Flush()
	return nil
}

// Request/Response types

type uploadFileRequest struct {
	Name string `json:"name"`
	Data string `json:"data"` // Base64-encoded content
}

func (r *uploadFileRequest) validate() error {
	if r.Name == "" {
		return NewValidationError("name")
	}
	if r.Data == "" {
		return NewValidationError("data")
	}
	return nil
}

type uploadChunkRequest struct {
	UploadID    string `json:"uploadId"`
	ChunkIndex  int    `json:"chunkIndex"`
	Data        string `json:"data"` // Base64-encoded chunk
	TotalChunks int    `json:"totalChunks"`
	Compressed  bool   `json:"compressed"`
}

func (r *uploadChunkRequest) validate() error {
	if r.UploadID == "" {
		return NewValidationError("uploadId")
	}
	if r.Data == "" {
		return NewValidationError("data")
	}
	return nil
}

type completeUploadRequest struct {
	UploadID       string `json:"uploadId"`
	Name           string `json:"name"`
	TotalChunks    int    `json:"totalChunks"`
	OriginalSize   int64  `json:"originalSize"`
	CompressedSize int64  `json:"compressedSize"`
	Encoding       string `json:"encoding"`
}

func (r *completeUploadRequest) validate() error {
	if r.UploadID == "" {
		return NewValidationError("uploadId")
	}
	if r.Name == "" {
		return NewValidationError("name")
	}
	if r.TotalChunks <= 0 {
		return NewBadRequestError("totalChunks must be positive", nil)
	}
	return nil
}

type renameFileRequest struct {
	Name string `json:"name"`
}

// Helper functions

// filterLogFiles filters out non-log files (maps, rules, etc.)
func filterLogFiles(files []*models.FileInfo) []*models.FileInfo {
	var logFiles []*models.FileInfo
	for _, f := range files {
		nameLower := strings.ToLower(f.Name)
		// Exclude map layouts and rules
		if !strings.HasSuffix(nameLower, ".xml") &&
			!strings.HasSuffix(nameLower, ".yaml") &&
			!strings.HasSuffix(nameLower, ".yml") {
			logFiles = append(logFiles, f)
		}
	}
	return logFiles
}
