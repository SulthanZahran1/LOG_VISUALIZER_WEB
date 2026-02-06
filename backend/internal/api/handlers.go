package api

import (
	"compress/gzip"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
	"github.com/vmihailenco/msgpack/v5"
)

// Handler handles API requests.
type Handler struct {
	store            storage.Store
	session          *session.Manager
	uploadManager    *upload.Manager
	currentMapID     string
	currentRulesID   string
	currentRules     *models.MapRules
	carrierSessionID string
}

// NewHandler creates a new API handler.
func NewHandler(store storage.Store, session *session.Manager, uploadMgr *upload.Manager) *Handler {
	return &Handler{
		store:         store,
		session:       session,
		uploadManager: uploadMgr,
	}
}

// LoadDefaultRules loads the default rules.yaml file if it exists.
func (h *Handler) LoadDefaultRules() error {
	rulesPath := "./data/defaults/rules.yaml"
	if _, err := os.Stat(rulesPath); os.IsNotExist(err) {
		return nil // No default rules file
	}

	file, err := os.Open(rulesPath)
	if err != nil {
		return fmt.Errorf("failed to open default rules: %w", err)
	}
	defer file.Close()

	rules, err := parser.ParseMapRulesFromReader(file)
	if err != nil {
		return fmt.Errorf("failed to parse default rules: %w", err)
	}

	h.currentRulesID = "default:rules.yaml"
	h.currentRules = rules
	return nil
}

// HandleHealth returns server health status.
func (h *Handler) HandleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
	})
}

// HandleUploadFile accepts a file as base64 JSON and saves it to storage.
func (h *Handler) HandleUploadFile(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // Base64-encoded file content
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.Name == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save file: %v", err)})
	}

	return c.JSON(http.StatusCreated, info)
}

// HandleRecentFiles returns a list of recently uploaded files.
func (h *Handler) HandleRecentFiles(c echo.Context) error {
	files, err := h.store.List(50) // Fetch more to allow for filtering
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list files"})
	}

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

	// Limit to 20 after filtering
	if len(logFiles) > 20 {
		logFiles = logFiles[:20]
	}

	return c.JSON(http.StatusOK, logFiles)
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

// HandleDeleteFile removes a file from storage and its associated parsed data.
func (h *Handler) HandleDeleteFile(c echo.Context) error {
	id := c.Param("id")
	err := h.store.Delete(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found or could not be deleted"})
	}
	// Also delete the parsed DuckDB if it exists
	if h.session != nil {
		h.session.DeleteParsedFile(id)
	}
	return c.NoContent(http.StatusNoContent)
}

// HandleRenameFile updates the name of a file.
func (h *Handler) HandleRenameFile(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name is required"})
	}

	info, err := h.store.Rename(id, req.Name)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found or could not be renamed"})
	}

	return c.JSON(http.StatusOK, info)
}

// HandleStartParse starts a parsing session for one or more files.
// Accepts either {"fileId": "id"} or {"fileIds": ["id1", "id2", ...]}.
func (h *Handler) HandleStartParse(c echo.Context) error {
	var req struct {
		FileID  string   `json:"fileId"`
		FileIDs []string `json:"fileIds"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	// Normalize to array
	var fileIDs []string
	if len(req.FileIDs) > 0 {
		fileIDs = req.FileIDs
	} else if req.FileID != "" {
		fileIDs = []string{req.FileID}
	} else {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "fileId or fileIds is required"})
	}

	// Get file paths for all files
	var filePaths []string
	var validFileIDs []string

	for _, fid := range fileIDs {
		info, err := h.store.Get(fid)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": fmt.Sprintf("file not found: %s", fid)})
		}

		path, err := h.store.GetFilePath(fid)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to get file path for: %s", fid)})
		}

		validFileIDs = append(validFileIDs, info.ID)
		filePaths = append(filePaths, path)
	}

	sess, err := h.session.StartMultiSession(validFileIDs, filePaths)
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
	// Touch session to prevent cleanup while being viewed
	h.session.TouchSession(id)
	return c.JSON(http.StatusOK, sess)
}

// HandleParseProgressStream streams parsing progress via SSE for real-time updates.
// This provides smooth progress transitions (10% → 89.9% → 100%) without polling.
func (h *Handler) HandleParseProgressStream(c echo.Context) error {
	id := c.Param("sessionId")

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	// Send initial status immediately
	sess, ok := h.session.GetSession(id)
	if !ok {
		data, _ := json.Marshal(map[string]string{"error": "session not found"})
		fmt.Fprintf(c.Response(), "data: %s\n\n", data)
		c.Response().Flush()
		return nil
	}

	// Stream progress updates until parsing completes or errors
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	lastProgress := -1.0
	for {
		select {
		case <-c.Request().Context().Done():
			return nil
		case <-ticker.C:
			sess, ok = h.session.GetSession(id)
			if !ok {
				data, _ := json.Marshal(map[string]string{"error": "session not found"})
				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
				return nil
			}

			// Only send update if progress changed
			if sess.Progress != lastProgress {
				lastProgress = sess.Progress

				data, err := json.Marshal(map[string]interface{}{
					"status":      sess.Status,
					"progress":    sess.Progress,
					"entryCount":  sess.EntryCount,
					"signalCount": sess.SignalCount,
					"parserName":  sess.ParserName,
					"error":       sess.Errors,
				})
				if err != nil {
					continue
				}

				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
			}

			// Stop if complete or error
			if sess.Status == models.SessionStatusComplete || sess.Status == models.SessionStatusError {
				return nil
			}
		}
	}
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
	// Cap page size to prevent excessive memory usage
	if pageSize > 1000 {
		pageSize = 1000
	}

	// Extract filter parameters
	params := parser.QueryParams{
		Search:        c.QueryParam("search"),
		Category:      c.QueryParam("category"),
		SortColumn:    c.QueryParam("sort"),
		SortDirection: c.QueryParam("order"),
		SignalType:    c.QueryParam("type"),
	}

	fmt.Printf("[API] QueryEntries: session=%s page=%d pageSize=%d search='%s'\n", id[:8], page, pageSize, params.Search)
	start := time.Now()

	// Pass request context for timeout/cancellation support
	entries, total, ok := h.session.QueryEntries(c.Request().Context(), id, params, page, pageSize)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	// Touch session to prevent cleanup while being actively viewed
	h.session.TouchSession(id)

	fmt.Printf("[API] QueryEntries: session=%s done in %v (returning %d/%d entries)\n", id[:8], time.Since(start), len(entries), total)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"entries":  entries,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// HandleParseChunk returns a time-windowed chunk of log entries.
// Accepts start/end via query params and signals via JSON body to avoid 414 URI Too Long errors.
func (h *Handler) HandleParseChunk(c echo.Context) error {
	id := c.Param("sessionId")

	// Parse timestamps as floats first (JavaScript sends float64), then convert to int64
	var startMs, endMs int64
	if startFloat, err := strconv.ParseFloat(c.QueryParam("start"), 64); err == nil {
		startMs = int64(startFloat)
	}
	if endFloat, err := strconv.ParseFloat(c.QueryParam("end"), 64); err == nil {
		endMs = int64(endFloat)
	}

	fmt.Printf("[API] HandleParseChunk: session=%s range=[%d, %d] (%d ms)\n", id[:8], startMs, endMs, endMs-startMs)

	var signals []string

	// Try to read signals from JSON body first (POST request)
	var body struct {
		Signals []string `json:"signals"`
	}
	if err := c.Bind(&body); err == nil && len(body.Signals) > 0 {
		signals = body.Signals
	} else {
		// Fallback to query param for backward compatibility
		signalsParam := c.QueryParam("signals")
		if signalsParam != "" {
			signals = strings.Split(signalsParam, ",")
		}
	}

	startTime := time.Now()

	entries, ok := h.session.GetChunk(c.Request().Context(), id, time.UnixMilli(startMs), time.UnixMilli(endMs), signals)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	// Touch session to prevent cleanup while being actively viewed (waveform)
	h.session.TouchSession(id)

	fmt.Printf("[API] HandleParseChunk: session=%s done in %v, returning %d entries\n", id[:8], time.Since(startTime), len(entries))

	return c.JSON(http.StatusOK, entries)
}

// HandleParseChunkBoundaries returns the boundary values (last value before start, first value after end)
// for waveform rendering to properly show signal state continuation.
func (h *Handler) HandleParseChunkBoundaries(c echo.Context) error {
	id := c.Param("sessionId")

	// Parse request body
	var req struct {
		Signals []string `json:"signals"`
		Start   float64  `json:"start"`
		End     float64  `json:"end"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	startMs := int64(req.Start)
	endMs := int64(req.End)

	if len(req.Signals) == 0 {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"before": map[string]interface{}{},
			"after":  map[string]interface{}{},
		})
	}

	startTime := time.Now()

	boundaries, ok := h.session.GetBoundaryValues(c.Request().Context(), id, time.UnixMilli(startMs), time.UnixMilli(endMs), req.Signals)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	// Touch session to prevent cleanup
	h.session.TouchSession(id)

	fmt.Printf("[API] HandleParseChunkBoundaries: session=%s done in %v, before=%d after=%d\n",
		id[:8], time.Since(startTime), len(boundaries.Before), len(boundaries.After))

	return c.JSON(http.StatusOK, map[string]interface{}{
		"before": boundaries.Before,
		"after":  boundaries.After,
	})
}

// HandleGetSignals returns the list of all unique signals for a session.
func (h *Handler) HandleGetSignals(c echo.Context) error {
	id := c.Param("sessionId")
	signals, ok := h.session.GetSignals(id)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}
	// Touch session to prevent cleanup while being actively viewed
	h.session.TouchSession(id)
	return c.JSON(http.StatusOK, signals)
}

// HandleGetCategories returns the list of all unique categories for a session.
func (h *Handler) HandleGetCategories(c echo.Context) error {
	id := c.Param("sessionId")
	cats, ok := h.session.GetCategories(c.Request().Context(), id)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}
	// Touch session to prevent cleanup while being actively viewed
	h.session.TouchSession(id)
	return c.JSON(http.StatusOK, cats)
}

// HandleGetValuesAtTime returns the state of signals at a specific time.
func (h *Handler) HandleGetValuesAtTime(c echo.Context) error {
	id := c.Param("sessionId")
	tsMs, err := strconv.ParseInt(c.QueryParam("ts"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid timestamp"})
	}

	signalsParam := c.QueryParam("signals")
	var signals []string
	if signalsParam != "" {
		signals = strings.Split(signalsParam, ",")
	}

	entries, ok := h.session.GetValuesAtTime(c.Request().Context(), id, time.UnixMilli(tsMs), signals)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	// Touch session to prevent cleanup while being actively viewed
	h.session.TouchSession(id)
	return c.JSON(http.StatusOK, entries)
}

// HandleSessionKeepAlive allows clients to explicitly keep a session alive.
// This is useful for long-running views (waveform, map) where the user may
// not be making data requests but is still actively viewing the session.
func (h *Handler) HandleSessionKeepAlive(c echo.Context) error {
	id := c.Param("sessionId")
	ok := h.session.TouchSession(id)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// HandleGetMapLayout returns the currently active map layout.
func (h *Handler) HandleGetMapLayout(c echo.Context) error {
	if h.currentMapID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{"objects": map[string]interface{}{}})
	}

	var path string
	var mapName string

	// Check if it's a default map
	if strings.HasPrefix(h.currentMapID, "default:") {
		cleanName := strings.TrimPrefix(h.currentMapID, "default:")
		path = filepath.Join("./data/defaults/maps", cleanName)
		mapName = cleanName
	} else {
		// Get file from store
		info, _ := h.store.Get(h.currentMapID)
		var err error
		path, err = h.store.GetFilePath(h.currentMapID)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to get map file path"})
		}
		if info != nil {
			mapName = info.Name
		} else {
			mapName = "Unknown Map"
		}
	}

	layout, err := parser.ParseMapXML(path)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to parse map layout: %v", err)})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"version": layout.Version,
		"objects": layout.Objects,
		"id":      h.currentMapID,
		"name":    mapName,
	})
}

// HandleUploadMapLayout accepts a map XML file as base64 JSON and sets it as the active layout.
func (h *Handler) HandleUploadMapLayout(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // Base64-encoded file content
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.Name == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save map file: %v", err)})
	}

	h.currentMapID = info.ID
	return c.JSON(http.StatusCreated, info)
}

// HandleSetActiveMap sets the currently active map layout by ID.
func (h *Handler) HandleSetActiveMap(c echo.Context) error {
	var req struct {
		ID string `json:"id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.ID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "id is required"})
	}

	// Verify file exists
	_, err := h.store.Get(req.ID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "map file not found"})
	}

	h.currentMapID = req.ID
	return c.JSON(http.StatusOK, map[string]string{"status": "active map updated"})
}

// HandleUploadMapRules accepts a YAML rules file as base64 JSON and sets it as the active rules.
func (h *Handler) HandleUploadMapRules(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // Base64-encoded file content
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.Name == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	// Parse the YAML to validate it
	rules, err := parser.ParseMapRulesFromBytes(decoded)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid YAML format: %v", err)})
	}

	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save rules file: %v", err)})
	}

	h.currentRulesID = info.ID
	h.currentRules = rules

	return c.JSON(http.StatusCreated, models.RulesInfo{
		ID:          info.ID,
		Name:        info.Name,
		UploadedAt:  info.UploadedAt.Format(time.RFC3339),
		RulesCount:  len(rules.Rules),
		DeviceCount: len(rules.DeviceToUnit),
	})
}

// HandleGetMapRules returns the currently active rules.
func (h *Handler) HandleGetMapRules(c echo.Context) error {
	if h.currentRulesID == "" || h.currentRules == nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"defaultColor": "#D3D3D3",
			"deviceToUnit": []interface{}{},
			"rules":        []interface{}{},
		})
	}

	// Get file info for metadata
	info, _ := h.store.Get(h.currentRulesID)

	response := map[string]interface{}{
		"id":           h.currentRulesID,
		"name":         "Unknown",
		"defaultColor": h.currentRules.DefaultColor,
		"deviceToUnit": h.currentRules.DeviceToUnit,
		"rules":        h.currentRules.Rules,
	}

	if info != nil {
		response["name"] = info.Name
	}

	return c.JSON(http.StatusOK, response)
}

// HandleRecentMapFiles returns lists of recently uploaded XML and YAML map files.
func (h *Handler) HandleRecentMapFiles(c echo.Context) error {
	files, err := h.store.List(50)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list files"})
	}

	var xmlFiles, yamlFiles []*models.FileInfo
	for _, f := range files {
		nameLower := strings.ToLower(f.Name)
		if strings.HasSuffix(nameLower, ".xml") {
			xmlFiles = append(xmlFiles, f)
		} else if strings.HasSuffix(nameLower, ".yaml") || strings.HasSuffix(nameLower, ".yml") {
			yamlFiles = append(yamlFiles, f)
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"xmlFiles":  xmlFiles,
		"yamlFiles": yamlFiles,
	})
}

// HandleUploadCarrierLog uploads and parses a carrier log (MCS format) as base64 JSON for carrier tracking.
func (h *Handler) HandleUploadCarrierLog(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // Base64-encoded file content
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.Name == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	// Save the file
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save file: %v", err)})
	}

	// Get file path
	path, err := h.store.GetFilePath(info.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to get file path"})
	}

	// Start parsing session
	sess, err := h.session.StartSession(info.ID, path)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to start session: %v", err)})
	}

	// Check if it's an MCS log by checking the parser name
	// Wait briefly for parsing to complete (carrier logs are typically small)
	for i := 0; i < 50; i++ { // Wait up to 5 seconds
		currentSess, ok := h.session.GetSession(sess.ID)
		if !ok {
			break
		}
		if currentSess.Status == "complete" || currentSess.Status == "error" {
			if currentSess.ParserName != "mcs_log" {
				return c.JSON(http.StatusBadRequest, map[string]string{
					"error": "Invalid carrier log format. Please upload an MCS/AMHS format log file with carrier tracking data.",
				})
			}
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	h.carrierSessionID = sess.ID

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"sessionId": sess.ID,
		"fileId":    info.ID,
		"fileName":  info.Name,
	})
}

// HandleGetCarrierLog returns the current carrier log session info.
func (h *Handler) HandleGetCarrierLog(c echo.Context) error {
	if h.carrierSessionID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"loaded": false,
		})
	}

	sess, ok := h.session.GetSession(h.carrierSessionID)
	if !ok {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"loaded": false,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"loaded":     true,
		"sessionId":  sess.ID,
		"status":     sess.Status,
		"entryCount": sess.EntryCount,
	})
}

// HandleGetCarrierEntries returns carrier log entries (CurrentLocation signals).
func (h *Handler) HandleGetCarrierEntries(c echo.Context) error {
	if h.carrierSessionID == "" {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "no carrier log loaded"})
	}

	// Get all entries (carrier logs are typically smaller)
	entries, total, ok := h.session.GetEntries(c.Request().Context(), h.carrierSessionID, 1, 100000)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "carrier session not found or not complete"})
	}

	// Filter to only CurrentLocation signals for carrier tracking
	var carrierEntries []map[string]interface{}
	for _, entry := range entries {
		if entry.SignalName == "CurrentLocation" {
			carrierEntries = append(carrierEntries, map[string]interface{}{
				"carrierId": entry.DeviceID,
				"unitId":    entry.Value,
				"timestamp": entry.Timestamp.UnixMilli(),
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"entries": carrierEntries,
		"total":   total,
	})
}

// HandleGetValidationRules returns placeholder validation rules.
func (h *Handler) HandleGetValidationRules(c echo.Context) error {
	return c.JSON(http.StatusOK, []interface{}{})
}

// HandleUpdateValidationRules updates placeholder validation rules.
func (h *Handler) HandleUpdateValidationRules(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// HandleGetDefaultMaps returns a list of available default map layouts.
func (h *Handler) HandleGetDefaultMaps(c echo.Context) error {
	defaultsDir := "./data/defaults/maps"

	entries, err := os.ReadDir(defaultsDir)
	if err != nil {
		// No defaults directory - return empty list
		return c.JSON(http.StatusOK, map[string]interface{}{
			"maps": []interface{}{},
		})
	}

	var maps []map[string]string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(strings.ToLower(name), ".xml") {
			maps = append(maps, map[string]string{
				"name": name,
				"id":   name, // Use filename as ID for defaults
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"maps": maps,
	})
}

// HandleLoadDefaultMap loads a specific default map by name.
func (h *Handler) HandleLoadDefaultMap(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name is required"})
	}

	// Sanitize filename to prevent path traversal
	cleanName := filepath.Base(req.Name)
	mapPath := filepath.Join("./data/defaults/maps", cleanName)

	// Verify file exists
	if _, err := os.Stat(mapPath); os.IsNotExist(err) {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "default map not found"})
	}

	// Parse to validate
	layout, err := parser.ParseMapXML(mapPath)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to parse map: %v", err)})
	}

	// Mark as active (use special prefix for defaults)
	h.currentMapID = "default:" + cleanName

	return c.JSON(http.StatusOK, map[string]interface{}{
		"version": layout.Version,
		"objects": layout.Objects,
		"id":      h.currentMapID,
		"name":    cleanName,
	})
}

// HandleUploadChunk accepts a single chunk of a file as base64 JSON.
func (h *Handler) HandleUploadChunk(c echo.Context) error {
	var req struct {
		UploadID    string `json:"uploadId"`
		ChunkIndex  int    `json:"chunkIndex"`
		Data        string `json:"data"` // Base64-encoded chunk
		TotalChunks int    `json:"totalChunks"`
		Compressed  bool   `json:"compressed"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.UploadID == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "uploadId and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	err = h.store.SaveChunkBytes(req.UploadID, req.ChunkIndex, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save chunk: %v", err)})
	}

	return c.NoContent(http.StatusAccepted)
}

// HandleCompleteUpload starts async processing of uploaded chunks.
// Returns immediately with a job ID for tracking progress via SSE.
func (h *Handler) HandleCompleteUpload(c echo.Context) error {
	var req struct {
		UploadID       string `json:"uploadId"`
		Name           string `json:"name"`
		TotalChunks    int    `json:"totalChunks"`
		OriginalSize   int64  `json:"originalSize"`
		CompressedSize int64  `json:"compressedSize"`
		Encoding       string `json:"encoding"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.UploadID == "" || req.Name == "" || req.TotalChunks <= 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "uploadId, name, and totalChunks are required"})
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

	fmt.Printf("[HandleCompleteUpload] Started async upload job %s for %s\n", job.ID, req.Name)

	// Return job ID immediately - client should connect to SSE for progress
	return c.JSON(http.StatusAccepted, map[string]interface{}{
		"jobId":  job.ID,
		"status": job.Status,
	})
}

// HandleUploadJobStream streams upload processing progress via Server-Sent Events.
func (h *Handler) HandleUploadJobStream(c echo.Context) error {
	jobID := c.Param("jobId")

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering
	c.Response().WriteHeader(http.StatusOK)

	// Get initial job state
	job, ok := h.uploadManager.GetJob(jobID)
	if !ok {
		data, _ := json.Marshal(map[string]string{"error": "job not found"})
		fmt.Fprintf(c.Response(), "data: %s\n\n", data)
		c.Response().Flush()
		return nil
	}

	// Stream progress updates
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request().Context().Done():
			return nil
		case <-ticker.C:
			job, ok = h.uploadManager.GetJob(jobID)
			if !ok {
				data, _ := json.Marshal(map[string]string{"error": "job not found"})
				fmt.Fprintf(c.Response(), "data: %s\n\n", data)
				c.Response().Flush()
				return nil
			}

			// Send current state
			data, err := json.Marshal(map[string]interface{}{
				"jobId":         job.ID,
				"status":        job.Status,
				"progress":      job.Progress,
				"stage":         job.Stage,
				"stageProgress": job.StageProgress,
				"fileInfo":      job.FileInfo,
				"error":         job.Error,
			})
			if err != nil {
				continue
			}

			fmt.Fprintf(c.Response(), "data: %s\n\n", data)
			c.Response().Flush()

			// Stop if job is complete or errored
			if job.Status == upload.StatusComplete || job.Status == upload.StatusError {
				return nil
			}
		}
	}
}

// decompressFile decompresses a gzip file in place using streaming
// to avoid loading large files into memory
func (h *Handler) decompressFile(fileID string) error {
	path, err := h.store.GetFilePath(fileID)
	if err != nil {
		return err
	}

	// Open compressed file
	compressedFile, err := os.Open(path)
	if err != nil {
		return err
	}
	defer compressedFile.Close()

	// Check gzip magic
	magic := make([]byte, 2)
	if _, err := compressedFile.Read(magic); err != nil {
		return err
	}
	if magic[0] != 0x1f || magic[1] != 0x8b {
		return fmt.Errorf("not a gzip file")
	}

	// Reset to beginning
	compressedFile.Seek(0, 0)

	// Create gzip reader
	reader, err := gzip.NewReader(compressedFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	// Create temp file for decompressed data
	tempPath := path + ".decompressing"
	outFile, err := os.Create(tempPath)
	if err != nil {
		return err
	}

	// Stream decompress (no loading into memory)
	_, err = io.Copy(outFile, reader)
	outFile.Close()

	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("decompression failed: %w", err)
	}

	// Replace original with decompressed
	if err := os.Rename(tempPath, path); err != nil {
		os.Remove(tempPath)
		return err
	}

	return nil
}

// HandleUploadBinary accepts pre-encoded binary log files as base64 JSON.
// This format is 85-95% smaller than raw text and requires zero parsing on backend.
func (h *Handler) HandleUploadBinary(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // Base64-encoded file content
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
	}

	if req.Name == "" || req.Data == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and data are required"})
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid base64 data"})
	}

	// Check magic number to verify it's a valid binary format
	if len(decoded) < 4 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid binary file"})
	}
	magic := binary.BigEndian.Uint32(decoded[0:4])
	if magic != parser.BinaryMagic {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid binary format magic number"})
	}

	// Save the binary file
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save file: %v", err)})
	}

	return c.JSON(http.StatusCreated, info)
}

// HandleParseEntriesMsgpack returns paginated log entries in MessagePack format.
// MessagePack is 30-50% smaller than JSON for log data.
func (h *Handler) HandleParseEntriesMsgpack(c echo.Context) error {
	id := c.Param("sessionId")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 {
		pageSize = 100
	}

	entries, total, ok := h.session.GetEntries(c.Request().Context(), id, page, pageSize)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found or not complete"})
	}

	data, err := msgpack.Marshal(map[string]interface{}{
		"entries":  entries,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to encode msgpack"})
	}

	return c.Blob(http.StatusOK, "application/msgpack", data)
}

// HandleParseStream streams log entries via Server-Sent Events for progressive loading.
// This allows the frontend to display entries as they are received rather than waiting
// for the entire payload.
func (h *Handler) HandleParseStream(c echo.Context) error {
	id := c.Param("sessionId")

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	// Get session to check total entries
	sess, ok := h.session.GetSession(id)
	if !ok {
		fmt.Fprintf(c.Response(), "data: {\"error\": \"session not found\"}\n\n")
		c.Response().Flush()
		return nil
	}

	// Wait for parsing to complete if still in progress
	for sess.Status == "parsing" || sess.Status == "pending" {
		time.Sleep(100 * time.Millisecond)
		sess, ok = h.session.GetSession(id)
		if !ok {
			break
		}
	}

	if sess.Status == "error" {
		errorMsg := "parsing failed"
		if len(sess.Errors) > 0 {
			errorMsg = sess.Errors[0].Reason
		}
		data, _ := json.Marshal(map[string]interface{}{"error": errorMsg})
		fmt.Fprintf(c.Response(), "data: %s\n\n", data)
		c.Response().Flush()
		return nil
	}

	// Stream entries in batches
	batchSize := 5000 // Entries per SSE event
	totalEntries := sess.EntryCount
	sent := 0

	for sent < totalEntries {
		page := (sent / batchSize) + 1
		entries, _, ok := h.session.GetEntries(c.Request().Context(), id, page, batchSize)
		if !ok || len(entries) == 0 {
			break
		}

		progress := 0
		if totalEntries > 0 {
			progress = min((sent+len(entries))*100/totalEntries, 100)
		}

		data, err := json.Marshal(map[string]interface{}{
			"entries":  entries,
			"progress": progress,
			"total":    totalEntries,
		})
		if err != nil {
			break
		}

		fmt.Fprintf(c.Response(), "data: %s\n\n", data)
		c.Response().Flush()

		sent += len(entries)

		// Touch session periodically during streaming to prevent cleanup
		if sent%10000 == 0 {
			h.session.TouchSession(id)
		}

		// Small delay to prevent overwhelming the connection
		if sent < totalEntries {
			time.Sleep(10 * time.Millisecond)
		}
	}

	// Send completion event
	data, _ := json.Marshal(map[string]interface{}{
		"done":     true,
		"total":    sent,
		"progress": 100,
	})
	fmt.Fprintf(c.Response(), "data: %s\n\n", data)
	c.Response().Flush()

	return nil
}
