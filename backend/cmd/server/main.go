// Package main is the entry point for the PLC Log Visualizer backend server.
package main

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/plc-visualizer/backend/internal/storage"
)

var fileStore storage.Store

func main() {
	// Initialize storage
	var err error
	fileStore, err = storage.NewLocalStore("./data/uploads")
	if err != nil {
		fmt.Printf("failed to initialize storage: %v\n", err)
		return
	}

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

// handleUploadFile accepts a multipart file upload and saves it to storage.
func handleUploadFile(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing file in request"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open uploaded file"})
	}
	defer src.Close()

	info, err := fileStore.Save(file.Filename, src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to save file: %v", err)})
	}

	return c.JSON(http.StatusCreated, info)
}

// handleRecentFiles returns a list of recently uploaded files.
func handleRecentFiles(c echo.Context) error {
	files, err := fileStore.List(20)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list files"})
	}
	return c.JSON(http.StatusOK, files)
}

// handleGetFile returns metadata for a specific file.
func handleGetFile(c echo.Context) error {
	id := c.Param("id")
	info, err := fileStore.Get(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found"})
	}
	return c.JSON(http.StatusOK, info)
}

// handleDeleteFile removes a file from storage.
func handleDeleteFile(c echo.Context) error {
	id := c.Param("id")
	err := fileStore.Delete(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "file not found or could not be deleted"})
	}
	return c.NoContent(http.StatusNoContent)
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
