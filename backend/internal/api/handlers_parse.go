// handlers_parse.go - Parse session operation handlers
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	pageSize := 1000
	var processedCount int

	for {
		ctx := c.Request().Context()
		entries, total, ok := h.sessionMgr.GetEntries(ctx, id, page, pageSize)
		if !ok {
			h.sendSSEError(c, "session not found")
			return nil
		}

		// Calculate progress
		processedCount += len(entries)
		progress := 0
		if total > 0 {
			progress = (processedCount * 100) / total
		}

		// Check if we're done
		isDone := len(entries) == 0 || processedCount >= total

		if isDone {
			// Send completion signal
			h.sendSSEData(c, map[string]interface{}{
				"done":  true,
				"total": total,
			})
			c.Response().Flush()
			return nil
		}

		h.sendSSEData(c, map[string]interface{}{
			"entries":  entries,
			"page":     page,
			"total":    total,
			"progress": progress,
		})
		c.Response().Flush()

		page++
	}
}

// HandleParseChunk returns entries within a time range
func (h *ParseHandlerImpl) HandleParseChunk(c echo.Context) error {
	id := c.Param("sessionId")
	if id == "" {
		return NewValidationError("sessionId")
	}

	// Parse time range from query params
	startTs, err := parseTimestamp(c.QueryParam("start"))
	if err != nil {
		return NewBadRequestError("invalid start time", err)
	}
	endTs, err := parseTimestamp(c.QueryParam("end"))
	if err != nil {
		return NewBadRequestError("invalid end time", err)
	}

	// Parse signal filter from body (optional)
	var req struct {
		Signals []string `json:"signals,omitempty"`
	}
	if err := c.Bind(&req); err == nil && len(req.Signals) > 0 {
		// Use signals from body if provided
		ctx := c.Request().Context()
		entries, ok := h.sessionMgr.GetChunk(ctx, id, startTs, endTs, req.Signals)
		if !ok {
			return NewNotFoundError("session", id)
		}
		return c.JSON(http.StatusOK, entries)
	}

	// Fallback to query params
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

	// Parse JSON body for time range and signals
	var req struct {
		Start   float64  `json:"start"`
		End     float64  `json:"end"`
		Signals []string `json:"signals"`
	}
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	startTs := time.UnixMilli(int64(req.Start))
	endTs := time.UnixMilli(int64(req.End))

	ctx := c.Request().Context()
	boundaries, ok := h.sessionMgr.GetBoundaryValues(ctx, id, startTs, endTs, req.Signals)
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
	queryParamFirst := func(keys ...string) string {
		for _, key := range keys {
			if value := c.QueryParam(key); value != "" {
				return value
			}
		}
		return ""
	}

	parseListParam := func(keys ...string) []string {
		rawValues := make([]string, 0, len(keys))
		for _, key := range keys {
			rawValues = append(rawValues, c.QueryParams()[key]...)
		}

		out := make([]string, 0, len(rawValues))
		seen := make(map[string]struct{}, len(rawValues))
		for _, raw := range rawValues {
			for _, part := range strings.Split(raw, ",") {
				value := strings.TrimSpace(part)
				if value == "" {
					continue
				}
				if _, exists := seen[value]; exists {
					continue
				}
				seen[value] = struct{}{}
				out = append(out, value)
			}
		}
		return out
	}

	return parser.QueryParams{
		Search:              c.QueryParam("search"),
		SearchRegex:         c.QueryParam("regex") == "true",
		SearchCaseSensitive: c.QueryParam("caseSensitive") == "true",
		ShowChanged:         c.QueryParam("showChangedOnly") == "true",
		Categories:          parseListParam("categories", "category"),
		SignalNames:         parseListParam("signalNames", "signalName"),
		DeviceIDs:           parseListParam("deviceIds", "deviceId"),
		Signals:             parseListParam("signals", "signal"),
		SignalType:          queryParamFirst("signalType", "type"),
		SortColumn:          queryParamFirst("sortColumn", "sort"),
		SortDirection:       queryParamFirst("sortDirection", "order"),
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

// ── Transition analysis ───────────────────────────────────────────────────────

type transitionCondition struct {
	DeviceID   string      `json:"deviceId"`
	SignalName string      `json:"signalName"`
	Condition  string      `json:"condition"` // equals|not-equals|greater|less|not-empty
	Value      interface{} `json:"value"`     // bool|number|string
}

type transitionRequest struct {
	Type           string              `json:"type"` // cycle|a-to-b|value-populated
	Start          transitionCondition `json:"start"`
	End            *transitionCondition `json:"end,omitempty"` // a-to-b only
	TargetDuration *float64            `json:"targetDuration,omitempty"` // ms
	Tolerance      *float64            `json:"tolerance,omitempty"`      // ms
}

type transitionResult struct {
	StartTime float64 `json:"startTime"` // Unix ms
	EndTime   float64 `json:"endTime"`   // Unix ms
	Duration  float64 `json:"duration"`  // ms
	Status    string  `json:"status"`    // ok|above|below|no-target
}

// HandleTransitions computes transition/tact-time results for the full session
// dataset by querying DuckDB directly — not limited to the current log table page.
//
// POST /api/parse/:sessionId/transitions
func (h *ParseHandlerImpl) HandleTransitions(c echo.Context) error {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		return NewValidationError("sessionId")
	}

	var req transitionRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	// Collect all signal pairs we need from the DB
	signals := []string{fmt.Sprintf("%s::%s", req.Start.DeviceID, req.Start.SignalName)}
	if req.End != nil && (req.End.DeviceID != req.Start.DeviceID || req.End.SignalName != req.Start.SignalName) {
		signals = append(signals, fmt.Sprintf("%s::%s", req.End.DeviceID, req.End.SignalName))
	}

	ctx := c.Request().Context()
	entries, ok := h.sessionMgr.QuerySignalEntries(ctx, sessionID, signals)
	if !ok {
		return NewNotFoundError("session", sessionID)
	}

	var results []transitionResult
	switch req.Type {
	case "cycle":
		results = computeCycleTransitions(entries, req)
	case "a-to-b":
		results = computeABTransitions(entries, req)
	case "value-populated":
		results = computeValuePopulatedTransitions(entries, req)
	default:
		return NewBadRequestError("unknown transition type: "+req.Type, nil)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"results": results})
}

func matchesCondition(entry models.LogEntry, cond transitionCondition) bool {
	if entry.DeviceID != cond.DeviceID || entry.SignalName != cond.SignalName {
		return false
	}
	v := entry.Value
	ev := cond.Value
	switch cond.Condition {
	case "equals":
		return fmt.Sprintf("%v", v) == fmt.Sprintf("%v", ev)
	case "not-equals":
		return fmt.Sprintf("%v", v) != fmt.Sprintf("%v", ev)
	case "greater":
		return toFloat(v) > toFloat(ev)
	case "less":
		return toFloat(v) < toFloat(ev)
	case "not-empty":
		return v != nil && v != "" && v != false
	}
	return false
}

func toFloat(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int64:
		return float64(x)
	case int:
		return float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	}
	return 0
}

func transitionStatus(duration float64, target, tolerance *float64) string {
	if target == nil {
		return "no-target"
	}
	tol := 0.0
	if tolerance != nil {
		tol = *tolerance
	}
	if duration >= *target-tol && duration <= *target+tol {
		return "ok"
	}
	if duration > *target+tol {
		return "above"
	}
	return "below"
}

func computeCycleTransitions(entries []models.LogEntry, req transitionRequest) []transitionResult {
	var results []transitionResult
	var lastMs *float64

	for _, e := range entries {
		if !matchesCondition(e, req.Start) {
			continue
		}
		ms := float64(e.Timestamp.UnixMilli())
		if lastMs != nil {
			dur := ms - *lastMs
			results = append(results, transitionResult{
				StartTime: *lastMs,
				EndTime:   ms,
				Duration:  dur,
				Status:    transitionStatus(dur, req.TargetDuration, req.Tolerance),
			})
		}
		lastMs = &ms
	}
	return results
}

func computeABTransitions(entries []models.LogEntry, req transitionRequest) []transitionResult {
	if req.End == nil {
		return nil
	}
	var results []transitionResult
	var startMs *float64

	for _, e := range entries {
		if startMs == nil {
			if matchesCondition(e, req.Start) {
				ms := float64(e.Timestamp.UnixMilli())
				startMs = &ms
			}
		} else {
			if matchesCondition(e, *req.End) {
				ms := float64(e.Timestamp.UnixMilli())
				dur := ms - *startMs
				results = append(results, transitionResult{
					StartTime: *startMs,
					EndTime:   ms,
					Duration:  dur,
					Status:    transitionStatus(dur, req.TargetDuration, req.Tolerance),
				})
				startMs = nil
			}
		}
	}
	return results
}

func computeValuePopulatedTransitions(entries []models.LogEntry, req transitionRequest) []transitionResult {
	var results []transitionResult
	var emptyMs *float64

	for _, e := range entries {
		if e.DeviceID != req.Start.DeviceID || e.SignalName != req.Start.SignalName {
			continue
		}
		isEmpty := e.Value == nil || e.Value == "" || e.Value == false
		if emptyMs == nil && isEmpty {
			ms := float64(e.Timestamp.UnixMilli())
			emptyMs = &ms
		} else if emptyMs != nil && !isEmpty {
			ms := float64(e.Timestamp.UnixMilli())
			dur := ms - *emptyMs
			results = append(results, transitionResult{
				StartTime: *emptyMs,
				EndTime:   ms,
				Duration:  dur,
				Status:    transitionStatus(dur, req.TargetDuration, req.Tolerance),
			})
			emptyMs = nil
		}
	}
	return results
}

func parseTimestamp(s string) (time.Time, error) {
	// Try parsing as float first (handles both integer and decimal timestamps)
	msFloat, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return time.Time{}, err
	}
	return time.UnixMilli(int64(msFloat)), nil
}

func parseInt64Param(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}
