// handlers_carrier.go - Carrier tracking operation handlers
package api

import (
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/storage"
)

// CarrierHandlerImpl implements the CarrierHandler interface
type CarrierHandlerImpl struct {
	store            storage.Store
	carrierSessionID string
	carrierEntries   []models.CarrierEntry
}

// NewCarrierHandler creates a new carrier handler instance
func NewCarrierHandler(store storage.Store) CarrierHandler {
	return &CarrierHandlerImpl{
		store:          store,
		carrierEntries: make([]models.CarrierEntry, 0),
	}
}

// GetCarrierSessionID returns the current carrier session ID
func (h *CarrierHandlerImpl) GetCarrierSessionID() string {
	return h.carrierSessionID
}

// SetCarrierSessionID sets the current carrier session ID
func (h *CarrierHandlerImpl) SetCarrierSessionID(sessionID string) {
	h.carrierSessionID = sessionID
}

// HandleUploadCarrierLog uploads and processes a carrier log file
func (h *CarrierHandlerImpl) HandleUploadCarrierLog(c echo.Context) error {
	var req uploadCarrierLogRequest
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

	// Save carrier log file
	info, err := h.store.SaveBytes(req.Name, decoded)
	if err != nil {
		return NewInternalError("failed to save carrier log", err)
	}

	h.carrierSessionID = info.ID

	// Parse carrier entries from the log
	entries, err := h.parseCarrierLog(decoded)
	if err != nil {
		return NewInternalError("failed to parse carrier log", err)
	}

	h.carrierEntries = entries

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"file":    info,
		"entries": len(entries),
	})
}

// HandleGetCarrierLog returns carrier log file metadata
func (h *CarrierHandlerImpl) HandleGetCarrierLog(c echo.Context) error {
	if h.carrierSessionID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"hasCarrierLog": false,
		})
	}

	info, err := h.store.Get(h.carrierSessionID)
	if err != nil {
		return NewNotFoundError("carrier log", h.carrierSessionID)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"hasCarrierLog": true,
		"file":          info,
		"entryCount":    len(h.carrierEntries),
	})
}

// HandleGetCarrierEntries returns carrier position entries
func (h *CarrierHandlerImpl) HandleGetCarrierEntries(c echo.Context) error {
	if h.carrierSessionID == "" {
		return c.JSON(http.StatusOK, []models.CarrierEntry{})
	}

	// Filter by time range if provided
	var filteredEntries []models.CarrierEntry

	startTimeStr := c.QueryParam("startTime")
	endTimeStr := c.QueryParam("endTime")

	if startTimeStr != "" && endTimeStr != "" {
		startMs := parseInt64Default(startTimeStr, 0)
		endMs := parseInt64Default(endTimeStr, 0)

		for _, entry := range h.carrierEntries {
			if entry.TimestampMs >= startMs && entry.TimestampMs <= endMs {
				filteredEntries = append(filteredEntries, entry)
			}
		}
	} else {
		filteredEntries = h.carrierEntries
	}

	return c.JSON(http.StatusOK, filteredEntries)
}

// parseCarrierLog parses carrier log data into entries
func (h *CarrierHandlerImpl) parseCarrierLog(data []byte) ([]models.CarrierEntry, error) {
	// This is a simplified parser - in production, this would parse
	// the actual carrier log format (CSV, XML, etc.)
	entries := make([]models.CarrierEntry, 0)

	// For now, return empty entries
	// Real implementation would parse the log format
	_ = data

	return entries, nil
}

// Request types

type uploadCarrierLogRequest struct {
	Name string `json:"name"`
	Data string `json:"data"` // Base64-encoded log content
}

func (r *uploadCarrierLogRequest) validate() error {
	if r.Name == "" {
		return NewValidationError("name")
	}
	if r.Data == "" {
		return NewValidationError("data")
	}
	return nil
}

// Helper functions

func parseInt64Default(s string, defaultVal int64) int64 {
	var val int64
	_, err := fmt.Sscanf(s, "%d", &val)
	if err != nil {
		return defaultVal
	}
	return val
}
