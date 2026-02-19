// handlers_map.go - Map configuration operation handlers
package api

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
	"github.com/plc-visualizer/backend/internal/storage"
)

// MapHandlerImpl implements the MapHandler interface
type MapHandlerImpl struct {
	store          storage.Store
	dataDir        string
	currentMapID   string
	currentRulesID string
	currentRules   *models.MapRules
}

// NewMapHandler creates a new map handler instance
func NewMapHandler(store storage.Store, dataDir string) MapHandler {
	return &MapHandlerImpl{
		store:   store,
		dataDir: dataDir,
	}
}

// SetCurrentMap sets the currently active map (used by other handlers)
func (h *MapHandlerImpl) SetCurrentMap(mapID string) {
	h.currentMapID = mapID
}

// GetCurrentMap returns the currently active map ID
func (h *MapHandlerImpl) GetCurrentMap() string {
	return h.currentMapID
}

// SetCurrentRules sets the currently active rules
func (h *MapHandlerImpl) SetCurrentRules(rulesID string, rules *models.MapRules) {
	h.currentRulesID = rulesID
	h.currentRules = rules
}

// GetCurrentRules returns the currently active rules
func (h *MapHandlerImpl) GetCurrentRules() (string, *models.MapRules) {
	return h.currentRulesID, h.currentRules
}

// HandleGetMapLayout returns the currently active map layout
func (h *MapHandlerImpl) HandleGetMapLayout(c echo.Context) error {
	if h.currentMapID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"objects": map[string]interface{}{},
		})
	}

	path, mapName, err := h.resolveMapPath(h.currentMapID)
	if err != nil {
		return NewInternalError("failed to resolve map path", err)
	}

	layout, err := parser.ParseMapXML(path)
	if err != nil {
		return NewInternalError("failed to parse map layout", err)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"layout":  layout,
		"name":    mapName,
		"mapId":   h.currentMapID,
		"rulesId": h.currentRulesID,
	})
}

// HandleUploadMapLayout uploads and activates a new map layout
func (h *MapHandlerImpl) HandleUploadMapLayout(c echo.Context) error {
	var req uploadMapRequest
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

	// Save map file
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return NewInternalError("failed to save map file", err)
	}

	// Set as current map
	h.currentMapID = info.ID

	return c.JSON(http.StatusCreated, info)
}

// HandleSetActiveMap sets the currently active map by ID
func (h *MapHandlerImpl) HandleSetActiveMap(c echo.Context) error {
	var req setActiveMapRequest
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	if req.MapID == "" {
		return NewValidationError("mapId")
	}

	// Verify map exists
	if strings.HasPrefix(req.MapID, "default:") {
		// Default map - verify file exists
		cleanName := strings.TrimPrefix(req.MapID, "default:")
		path := filepath.Join(h.dataDir, "defaults", "maps", cleanName)
		if _, err := filepath.Abs(path); err != nil {
			return NewNotFoundError("map", req.MapID)
		}
	} else {
		// User-uploaded map
		if _, err := h.store.Get(req.MapID); err != nil {
			return NewNotFoundError("map", req.MapID)
		}
	}

	h.currentMapID = req.MapID
	return c.JSON(http.StatusOK, map[string]string{"mapId": h.currentMapID})
}

// HandleUploadMapRules uploads and activates map rules
func (h *MapHandlerImpl) HandleUploadMapRules(c echo.Context) error {
	var req uploadRulesRequest
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

	// Parse rules to validate
	rules, err := parser.ParseMapRulesFromReader(strings.NewReader(string(decoded)))
	if err != nil {
		return NewBadRequestError("invalid rules YAML", err)
	}

	// Save rules file
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return NewInternalError("failed to save rules file", err)
	}

	// Set as current rules
	h.currentRulesID = info.ID
	h.currentRules = rules

	return c.JSON(http.StatusCreated, info)
}

// HandleGetMapRules returns the currently active map rules
func (h *MapHandlerImpl) HandleGetMapRules(c echo.Context) error {
	if h.currentRules == nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"rules": nil,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"rules":   h.currentRules,
		"rulesId": h.currentRulesID,
	})
}

// HandleRecentMapFiles returns recent map and rules files
func (h *MapHandlerImpl) HandleRecentMapFiles(c echo.Context) error {
	files, err := h.store.List(50)
	if err != nil {
		return NewInternalError("failed to list files", err)
	}

	// Filter to only map/rules files
	var mapFiles []*models.FileInfo
	for _, f := range files {
		nameLower := strings.ToLower(f.Name)
		if strings.HasSuffix(nameLower, ".xml") ||
			strings.HasSuffix(nameLower, ".yaml") ||
			strings.HasSuffix(nameLower, ".yml") {
			mapFiles = append(mapFiles, f)
		}
	}

	return c.JSON(http.StatusOK, mapFiles)
}

// HandleGetDefaultMaps returns available default maps
func (h *MapHandlerImpl) HandleGetDefaultMaps(c echo.Context) error {
	// List default maps from data/defaults/maps directory
	defaultMapsDir := filepath.Join(h.dataDir, "defaults", "maps")
	maps := []map[string]string{}

	// This would typically read the directory, but we'll return empty for now
	_ = defaultMapsDir

	return c.JSON(http.StatusOK, maps)
}

// HandleLoadDefaultMap loads a default map by name
func (h *MapHandlerImpl) HandleLoadDefaultMap(c echo.Context) error {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return NewBadRequestError("invalid request body", err)
	}

	if req.Name == "" {
		return NewValidationError("name")
	}

	mapID := "default:" + req.Name
	h.currentMapID = mapID

	return c.JSON(http.StatusOK, map[string]string{
		"mapId": mapID,
		"name":  req.Name,
	})
}

// HandleGetValidationRules returns validation rules for the current session
func (h *MapHandlerImpl) HandleGetValidationRules(c echo.Context) error {
	// Validation rules not yet implemented in MapRules model
	return c.JSON(http.StatusOK, map[string]interface{}{
		"rules": []interface{}{},
	})
}

// HandleUpdateValidationRules updates validation rules
func (h *MapHandlerImpl) HandleUpdateValidationRules(c echo.Context) error {
	// This would update rules in the current session
	// For now, return not implemented
	return c.JSON(http.StatusNotImplemented, map[string]string{
		"error": "Not implemented",
	})
}

// Helper methods

func (h *MapHandlerImpl) resolveMapPath(mapID string) (string, string, error) {
	if strings.HasPrefix(mapID, "default:") {
		cleanName := strings.TrimPrefix(mapID, "default:")
		path := filepath.Join(h.dataDir, "defaults", "maps", cleanName)
		return path, cleanName, nil
	}

	info, err := h.store.Get(mapID)
	if err != nil {
		return "", "", fmt.Errorf("map not found: %w", err)
	}

	path, err := h.store.GetFilePath(mapID)
	if err != nil {
		return "", "", fmt.Errorf("failed to get file path: %w", err)
	}

	return path, info.Name, nil
}

// Request types

type uploadMapRequest struct {
	Name string `json:"name"`
	Data string `json:"data"` // Base64-encoded XML
}

func (r *uploadMapRequest) validate() error {
	if r.Name == "" {
		return NewValidationError("name")
	}
	if r.Data == "" {
		return NewValidationError("data")
	}
	return nil
}

type uploadRulesRequest struct {
	Name string `json:"name"`
	Data string `json:"data"` // Base64-encoded YAML
}

func (r *uploadRulesRequest) validate() error {
	if r.Name == "" {
		return NewValidationError("name")
	}
	if r.Data == "" {
		return NewValidationError("data")
	}
	return nil
}

type setActiveMapRequest struct {
	MapID string `json:"mapId"`
}
