// handlers_health.go - Health check handlers
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// HealthHandlerImpl implements the HealthHandler interface
type HealthHandlerImpl struct {
	version           string
	allowFileDeletion bool
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(version string, allowFileDeletion bool) HealthHandler {
	return &HealthHandlerImpl{
		version:           version,
		allowFileDeletion: allowFileDeletion,
	}
}

// HandleHealth returns server health status
func (h *HealthHandlerImpl) HandleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{
		"status":            "ok",
		"version":           h.version,
		"allowFileDeletion": h.allowFileDeletion,
	})
}
