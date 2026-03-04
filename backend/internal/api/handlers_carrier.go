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
	carrierFileID    string
	carrierFileName  string
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

// SetCarrierFile stores the active carrier file metadata.
func (h *CarrierHandlerImpl) SetCarrierFile(fileID, fileName string) {
	h.carrierFileID = fileID
	h.carrierFileName = fileName
}

// HandleFileDeleted clears carrier state tied to a deleted file.
func (h *CarrierHandlerImpl) HandleFileDeleted(fileID string) {
	if h.carrierFileID != fileID && h.carrierSessionID != fileID {
		return
	}

	h.carrierFileID = ""
	h.carrierFileName = ""
	h.carrierSessionID = ""
	h.carrierEntries = make([]models.CarrierEntry, 0)
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

	h.SetCarrierFile(info.ID, info.Name)
	// Keep HTTP and WebSocket response contracts aligned. The HTTP path does not
	// create a separate parse session yet, so the file ID is also the session ID.
	h.carrierSessionID = info.ID

	// Parse carrier entries from the log
	entries, err := h.parseCarrierLog(decoded)
	if err != nil {
		return NewInternalError("failed to parse carrier log", err)
	}

	h.carrierEntries = entries

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"sessionId": h.carrierSessionID,
		"fileId":    info.ID,
		"fileName":  info.Name,
	})
}

// HandleGetCarrierLog returns carrier log file metadata
func (h *CarrierHandlerImpl) HandleGetCarrierLog(c echo.Context) error {
	if h.carrierFileID == "" && h.carrierSessionID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"loaded": false,
		})
	}

	if h.carrierFileID != "" {
		if _, err := h.store.Get(h.carrierFileID); err != nil {
			h.HandleFileDeleted(h.carrierFileID)
			return c.JSON(http.StatusOK, map[string]interface{}{
				"loaded": false,
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"loaded":     true,
		"sessionId":  h.carrierSessionID,
		"status":     "complete",
		"entryCount": len(h.carrierEntries),
	})
}

// HandleGetCarrierEntries returns carrier position entries
func (h *CarrierHandlerImpl) HandleGetCarrierEntries(c echo.Context) error {
	if h.carrierFileID == "" && h.carrierSessionID == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"entries": []models.CarrierEntry{},
			"total":   0,
		})
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

	return c.JSON(http.StatusOK, map[string]interface{}{
		"entries": filteredEntries,
		"total":   len(filteredEntries),
	})
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
