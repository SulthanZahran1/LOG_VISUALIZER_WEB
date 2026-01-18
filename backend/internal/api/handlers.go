package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
)

// Handler handles API requests.
type Handler struct {
	store            storage.Store
	session          *session.Manager
	currentMapID     string
	currentRulesID   string
	currentRules     *models.MapRules
	carrierSessionID string
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

// HandleDeleteFile removes a file from storage.
func (h *Handler) HandleDeleteFile(c echo.Context) error {
	id := c.Param("id")
	err := h.store.Delete(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found or could not be deleted"})
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

// HandleGetMapLayout returns the currently active map layout.
func (h *Handler) HandleGetMapLayout(c echo.Context) error {
	if h.currentMapID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{"objects": map[string]interface{}{}})
	}

	// Get file info for metadata
	info, err := h.store.Get(h.currentMapID)
	if err != nil {
		// Log error but proceed? Or fail. Let's fail safe.
	}

	path, err := h.store.GetFilePath(h.currentMapID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to get map file path"})
	}

	layout, err := parser.ParseMapXML(path)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to parse map layout: %v", err)})
	}

	response := map[string]interface{}{
		"version": layout.Version,
		"objects": layout.Objects,
		"id":      h.currentMapID,
		"name":    "Unknown Map",
	}

	if info != nil {
		response["name"] = info.Name
	}

	return c.JSON(http.StatusOK, response)
}

// HandleUploadMapLayout accepts a map XML file and sets it as the active layout.
func (h *Handler) HandleUploadMapLayout(c echo.Context) error {
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

// HandleUploadMapRules accepts a YAML rules file and sets it as the active rules.
func (h *Handler) HandleUploadMapRules(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file in request"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open uploaded file"})
	}
	defer src.Close()

	// Parse the YAML to validate it
	rules, err := parser.ParseMapRulesFromReader(src)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid YAML format: %v", err)})
	}

	// Reopen to save
	src2, _ := file.Open()
	defer src2.Close()

	info, err := h.store.Save(file.Filename, src2)
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

// HandleUploadCarrierLog uploads and parses a carrier log (MCS format) for carrier tracking.
func (h *Handler) HandleUploadCarrierLog(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file in request"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open uploaded file"})
	}
	defer src.Close()

	// Save the file
	info, err := h.store.Save(file.Filename, src)
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
	entries, total, ok := h.session.GetEntries(h.carrierSessionID, 1, 100000)
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

// HandleUploadChunk accepts a single chunk of a file.
func (h *Handler) HandleUploadChunk(c echo.Context) error {
	uploadID := c.FormValue("uploadId")
	chunkIndexStr := c.FormValue("chunkIndex")

	if uploadID == "" || chunkIndexStr == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "uploadId and chunkIndex are required"})
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid chunkIndex"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file chunk in request"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open chunk"})
	}
	defer src.Close()

	err = h.store.SaveChunk(uploadID, chunkIndex, src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save chunk: %v", err)})
	}

	return c.NoContent(http.StatusAccepted)
}

// HandleCompleteUpload assembles the uploaded chunks.
func (h *Handler) HandleCompleteUpload(c echo.Context) error {
	var req struct {
		UploadID    string `json:"uploadId"`
		Name        string `json:"name"`
		TotalChunks int    `json:"totalChunks"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.UploadID == "" || req.Name == "" || req.TotalChunks <= 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "uploadId, name, and totalChunks are required"})
	}

	info, err := h.store.CompleteChunkedUpload(req.UploadID, req.Name, req.TotalChunks)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to complete upload: %v", err)})
	}

	return c.JSON(http.StatusCreated, info)
}
