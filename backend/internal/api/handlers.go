package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
)

// Handler handles API requests.
type Handler struct {
	store   storage.Store
	session *session.Manager
}

// NewHandler creates a new API handler.
func NewHandler(store storage.Store, session *session.Manager) *Handler {
	return &Handler{
		store:   store,
		session: session,
	}
}

// HandleHealth returns server health status.
func (h *Handler) HandleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
	})
}

// HandleUploadFile accepts a multipart file upload and saves it to storage.
func (h *Handler) HandleUploadFile(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file in request"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open uploaded file"})
	}
	defer src.Close()

	info, err := h.store.Save(file.Filename, src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save file: %v", err)})
	}

	return c.JSON(http.StatusCreated, info)
}

// HandleRecentFiles returns a list of recently uploaded files.
func (h *Handler) HandleRecentFiles(c echo.Context) error {
	files, err := h.store.List(20)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list files"})
	}
	return c.JSON(http.StatusOK, files)
}

// HandleGetFile returns metadata for a specific file.
func (h *Handler) HandleGetFile(c echo.Context) error {
	id := c.Param("id")
	info, err := h.store.Get(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
	}
	return c.JSON(http.StatusOK, info)
}

// HandleDeleteFile removes a file from storage.
func (h *Handler) HandleDeleteFile(c echo.Context) error {
	id := c.Param("id")
	err := h.store.Delete(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found or could not be deleted"})
	}
	return c.NoContent(http.StatusNoContent)
}

// HandleStartParse starts a parsing session for a file.
func (h *Handler) HandleStartParse(c echo.Context) error {
	var req struct {
		FileID string `json:"fileId"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.FileID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "fileId is required"})
	}

	info, err := h.store.Get(req.FileID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
	}

	path, err := h.store.GetFilePath(req.FileID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to get file path"})
	}

	sess, err := h.session.StartSession(info.ID, path)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to start session: %v", err)})
	}

	return c.JSON(http.StatusAccepted, sess)
}

// HandleParseStatus returns the status of a parsing session.
func (h *Handler) HandleParseStatus(c echo.Context) error {
	id := c.Param("sessionId")
	sess, ok := h.session.GetSession(id)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	return c.JSON(http.StatusOK, sess)
}

// HandleParseEntries returns paginated log entries for a session.
func (h *Handler) HandleParseEntries(c echo.Context) error {
	id := c.Param("sessionId")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 {
		pageSize = 100
	}

	entries, total, ok := h.session.GetEntries(id, page, pageSize)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"entries":  entries,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// HandleParseChunk returns a time-windowed chunk of log entries.
func (h *Handler) HandleParseChunk(c echo.Context) error {
	id := c.Param("sessionId")
	startMs, _ := strconv.ParseInt(c.QueryParam("start"), 10, 64)
	endMs, _ := strconv.ParseInt(c.QueryParam("end"), 10, 64)

	startTs := time.UnixMilli(startMs)
	endTs := time.UnixMilli(endMs)

	entries, ok := h.session.GetChunk(id, startTs, endTs)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	return c.JSON(http.StatusOK, entries)
}

// HandleGetSignals returns the list of all unique signals for a session.
func (h *Handler) HandleGetSignals(c echo.Context) error {
	id := c.Param("sessionId")
	signals, ok := h.session.GetSignals(id)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	return c.JSON(http.StatusOK, signals)
}

// HandleGetMapConfig returns a placeholder map config.
func (h *Handler) HandleGetMapConfig(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{})
}

// HandleGetValidationRules returns placeholder validation rules.
func (h *Handler) HandleGetValidationRules(c echo.Context) error {
	return c.JSON(http.StatusOK, []interface{}{})
}

// HandleUpdateValidationRules updates placeholder validation rules.
func (h *Handler) HandleUpdateValidationRules(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}
