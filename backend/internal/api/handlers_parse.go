// handlers_parse.go - Parse session operation handlers
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/storage"
)

// ParseHandlerImpl implements the ParseHandler interface
type ParseHandlerImpl struct {
	store      storage.Store
	sessionMgr SessionManager
}

// NewParseHandler creates a new parse handler instance
func NewParseHandler(store storage.Store, sessionMgr SessionManager) ParseHandler {
	return &ParseHandlerImpl{
		store:      store,
		sessionMgr: sessionMgr,
	}
}

// HandleStartParse starts a new parsing session for one or more files
func (h *ParseHandlerImpl) HandleStartParse(c echo.Context) error {
	var req startParseRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	// Normalize to array of file IDs
	fileIDs := req.normalizeFileIDs()
	if len(fileIDs) == 0 {
		return NewValidationError("fileId or fileIds")
	}

	// Get file paths for all files
	filePaths, validFileIDs, err := h.resolveFilePaths(fileIDs)
	if err != nil {
		return err
	}

	// Start parsing session
	sess, err := h.sessionMgr.StartMultiSession(validFileIDs, filePaths)
	if err != nil {
		return NewInternalError("failed to start session", err)
	}

	return c.JSON(http.StatusAccepted, sess)
}

// HandleParseStatus returns the current status of a parsing session
func (h *ParseHandlerImpl) HandleParseStatus(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	sess, ok := h.sessionMgr.GetSession(id)
	if !ok {
		return NewNotFoundError("session", id)
	}

	// Touch session to prevent cleanup while being viewed
	h.sessionMgr.TouchSession(id)

	return c.JSON(http.StatusOK, sess)
}

// HandleSessionKeepAlive extends session lifetime for active viewing
func (h *ParseHandlerImpl) HandleSessionKeepAlive(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	if ok := h.sessionMgr.TouchSession(id); !ok {
		return NewNotFoundError("session", id)
	}

	return c.NoContent(http.StatusNoContent)
}

// HandleParseProgressStream streams parsing progress via SSE
func (h *ParseHandlerImpl) HandleParseProgressStream(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	// Get initial session state
	sess, ok := h.sessionMgr.GetSession(id)
	if !ok {
		h.sendSSEError(c, "session not found")
		return nil
	}

	// Send initial status
	h.sendSSEData(c, sess)

	// Stream updates until complete or error
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	timeout := time.NewTimer(5 * time.Minute)
	defer timeout.Stop()

	for {
		select {
		case <-ticker.C:
			sess, ok := h.sessionMgr.GetSession(id)
			if !ok {
				h.sendSSEError(c, "session not found")
				return nil
			}

			h.sendSSEData(c, sess)

			// Stop streaming if complete or error
			if sess.Status == models.SessionStatusComplete ||
				sess.Status == models.SessionStatusError {
				return nil
			}

		case <-timeout.C:
			h.sendSSEError(c, "stream timeout")
			return nil
		}
	}
}

// HandleParseEntries returns paginated log entries for a session
func (h *ParseHandlerImpl) HandleParseEntries(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Parse pagination params
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 100
	}

	// Build query params from filters
	params := h.buildQueryParams(c)

	ctx := c.Request().Context()
	entries, total, ok := h.sessionMgr.QueryEntries(ctx, id, params, page, pageSize)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, entriesResponse{
		Entries:  entries,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	})
}

// HandleParseEntriesMsgpack returns entries in MessagePack format
func (h *ParseHandlerImpl) HandleParseEntriesMsgpack(c echo.Context) error {
	// Implementation similar to HandleParseEntries but with msgpack encoding
	// For now, delegate to regular handler
	return h.HandleParseEntries(c)
}

// HandleParseStream streams entries via SSE for real-time updates
func (h *ParseHandlerImpl) HandleParseStream(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	// Stream entries in chunks
	page := 1
	pageSize := 100

	for {
		ctx := c.Request().Context()
		entries, total, ok := h.sessionMgr.GetEntries(ctx, id, page, pageSize)
		if !ok {
			h.sendSSEError(c, "session not found")
			return nil
		}

		h.sendSSEData(c, map[string]interface{}{
			"entries": entries,
			"page":    page,
			"total":   total,
		})

		// Check if we've sent all entries
		if len(entries) == 0 || page*pageSize >= total {
			return nil
		}

		page++
		c.Response().Flush()
	}
}

// HandleParseChunk returns entries within a time range
func (h *ParseHandlerImpl) HandleParseChunk(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Parse time range
	startTs, err := parseTimestamp(c.QueryParam("start"))
	if err != nil {
		return NewBadRequestError("invalid start time", err)
	}
	endTs, err := parseTimestamp(c.QueryParam("end"))
	if err != nil {
		return NewBadRequestError("invalid end time", err)
	}

	// Parse signal filter
	signals := c.QueryParams()["signals"]

	ctx := c.Request().Context()
	entries, ok := h.sessionMgr.GetChunk(ctx, id, startTs, endTs, signals)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, entries)
}

// HandleParseChunkBoundaries returns boundary values for a time range
func (h *ParseHandlerImpl) HandleParseChunkBoundaries(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Parse time range
	startTs, err := parseTimestamp(c.QueryParam("start"))
	if err != nil {
		return NewBadRequestError("invalid start time", err)
	}
	endTs, err := parseTimestamp(c.QueryParam("end"))
	if err != nil {
		return NewBadRequestError("invalid end time", err)
	}

	signals := c.QueryParams()["signals"]

	ctx := c.Request().Context()
	boundaries, ok := h.sessionMgr.GetBoundaryValues(ctx, id, startTs, endTs, signals)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, boundaries)
}

// HandleGetSignals returns all unique signals in a session
func (h *ParseHandlerImpl) HandleGetSignals(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	signals, ok := h.sessionMgr.GetSignals(id)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, signals)
}

// HandleGetSignalTypes returns signal type mapping for a session
func (h *ParseHandlerImpl) HandleGetSignalTypes(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	signalTypes, ok := h.sessionMgr.GetSignalTypes(id)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, signalTypes)
}

// HandleGetCategories returns unique categories in a session
func (h *ParseHandlerImpl) HandleGetCategories(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	ctx := c.Request().Context()
	categories, ok := h.sessionMgr.GetCategories(ctx, id)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, categories)
}

// HandleGetIndexByTime returns the entry index for a specific timestamp
func (h *ParseHandlerImpl) HandleGetIndexByTime(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	ts, err := parseInt64Param(c.QueryParam("timestamp"))
	if err != nil {
		return NewBadRequestError("invalid timestamp", err)
	}

	params := h.buildQueryParams(c)

	ctx := c.Request().Context()
	index, ok := h.sessionMgr.GetIndexByTime(ctx, id, params, ts)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, map[string]int{"index": index})
}

// HandleGetTimeTree returns a time-based tree structure for navigation
func (h *ParseHandlerImpl) HandleGetTimeTree(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	params := h.buildQueryParams(c)

	ctx := c.Request().Context()
	tree, ok := h.sessionMgr.GetTimeTree(ctx, id, params)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, tree)
}

// HandleGetValuesAtTime returns signal values at a specific timestamp
func (h *ParseHandlerImpl) HandleGetValuesAtTime(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	ts, err := parseTimestamp(c.QueryParam("timestamp"))
	if err != nil {
		return NewBadRequestError("invalid timestamp", err)
	}

	signals := c.QueryParams()["signals"]

	ctx := c.Request().Context()
	entries, ok := h.sessionMgr.GetValuesAtTime(ctx, id, ts, signals)
	if !ok {
		return NewNotFoundError("session", id)
	}

	return c.JSON(http.StatusOK, entries)
}

// Request/Response types

type startParseRequest struct {
	FileID  string   `json:"fileId"`
	FileIDs []string `json:"fileIds"`
}

func (r *startParseRequest) normalizeFileIDs() []string {
	if len(r.FileIDs) > 0 {
		return r.FileIDs
	}
	if r.FileID != "" {
		return []string{r.FileID}
	}
	return nil
}

type entriesResponse struct {
	Entries  []models.LogEntry `json:"entries"`
	Page     int               `json:"page"`
	PageSize int               `json:"pageSize"`
	Total    int               `json:"total"`
}

// Helper methods

func (h *ParseHandlerImpl) resolveFilePaths(fileIDs []string) ([]string, []string, error) {
	var filePaths []string
	var validFileIDs []string

	for _, fid := range fileIDs {
		info, err := h.store.Get(fid)
		if err != nil {
			return nil, nil, NewNotFoundError("file", fid)
		}

		path, err := h.store.GetFilePath(fid)
		if err != nil {
			return nil, nil, NewInternalError("failed to get file path", err)
		}

		validFileIDs = append(validFileIDs, info.ID)
		filePaths = append(filePaths, path)
	}

	return filePaths, validFileIDs, nil
}

func (h *ParseHandlerImpl) buildQueryParams(c echo.Context) parser.QueryParams {
	return parser.QueryParams{
		Search:              c.QueryParam("search"),
		SearchRegex:         c.QueryParam("regex") == "true",
		SearchCaseSensitive: c.QueryParam("caseSensitive") == "true",
		ShowChanged:         c.QueryParam("showChangedOnly") == "true",
		Categories:          c.QueryParams()["categories"],
		Signals:             c.QueryParams()["signals"],
		SignalType:          c.QueryParam("signalType"),
		SortColumn:          c.QueryParam("sortColumn"),
		SortDirection:       c.QueryParam("sortDirection"),
	}
}

func (h *ParseHandlerImpl) sendSSEData(c echo.Context, data interface{}) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(c.Response(), "data: %s\n\n", jsonData)
	c.Response().Flush()
}

func (h *ParseHandlerImpl) sendSSEError(c echo.Context, message string) {
	h.sendSSEData(c, map[string]string{"error": message})
}

func parseTimestamp(s string) (time.Time, error) {
	ms, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return time.Time{}, err
	}
	return time.UnixMilli(ms), nil
}

func parseInt64Param(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}
