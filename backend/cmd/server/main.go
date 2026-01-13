// Package main is the entry point for the PLC Log Visualizer backend server.
package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// CORS configuration for frontend dev server
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept},
	}))

	// Routes
	api := e.Group("/api")

	// Health check
	api.GET("/health", handleHealth)

	// File management (placeholders)
	api.POST("/files/upload", handleUploadFile)
	api.GET("/files/recent", handleRecentFiles)
	api.GET("/files/:id", handleGetFile)
	api.DELETE("/files/:id", handleDeleteFile)

	// Parse management (placeholders)
	api.POST("/parse", handleStartParse)
	api.GET("/parse/:sessionId/status", handleParseStatus)
	api.GET("/parse/:sessionId/entries", handleParseEntries)
	api.GET("/parse/:sessionId/chunk", handleParseChunk)

	// Config (placeholders)
	api.GET("/config/map", handleGetMapConfig)
	api.GET("/config/validation-rules", handleGetValidationRules)
	api.PUT("/config/validation-rules", handleUpdateValidationRules)

	// Start server
	e.Logger.Fatal(e.Start(":8080"))
}

// handleHealth returns server health status.
func handleHealth(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
	})
}

// Placeholder handlers - to be implemented in Phase 1

func handleUploadFile(c echo.Context) error {
	// TODO: Implement file upload
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleRecentFiles(c echo.Context) error {
	// TODO: Implement recent files list
	return c.JSON(http.StatusOK, []interface{}{})
}

func handleGetFile(c echo.Context) error {
	// TODO: Implement get file info
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleDeleteFile(c echo.Context) error {
	// TODO: Implement file deletion
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleStartParse(c echo.Context) error {
	// TODO: Implement parse start
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleParseStatus(c echo.Context) error {
	// TODO: Implement parse status
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleParseEntries(c echo.Context) error {
	// TODO: Implement paginated entries
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleParseChunk(c echo.Context) error {
	// TODO: Implement time-window chunk
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleGetMapConfig(c echo.Context) error {
	// TODO: Implement map config
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleGetValidationRules(c echo.Context) error {
	// TODO: Implement validation rules get
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}

func handleUpdateValidationRules(c echo.Context) error {
	// TODO: Implement validation rules update
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not implemented"})
}
