package main

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/plc-visualizer/backend/internal/api"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
)

func main() {
	// Initialize storage
	fileStore, err := storage.NewLocalStore("./data/uploads")
	if err != nil {
		fmt.Printf("failed to initialize storage: %v\n", err)
		return
	}

	// Initialize session manager
	sessionMgr := session.NewManager()

	// Initialize API handler
	h := api.NewHandler(fileStore, sessionMgr)

	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.BodyLimit("1G"))

	// CORS configuration for frontend dev server
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept},
	}))

	// Routes
	apiGroup := e.Group("/api")

	// Health check
	apiGroup.GET("/health", h.HandleHealth)

	// File management
	apiGroup.POST("/files/upload", h.HandleUploadFile)
	apiGroup.POST("/files/upload/chunk", h.HandleUploadChunk)
	apiGroup.POST("/files/upload/complete", h.HandleCompleteUpload)
	apiGroup.GET("/files/recent", h.HandleRecentFiles)
	apiGroup.GET("/files/:id", h.HandleGetFile)
	apiGroup.DELETE("/files/:id", h.HandleDeleteFile)
	apiGroup.PUT("/files/:id", h.HandleRenameFile)

	// Parse management
	apiGroup.POST("/parse", h.HandleStartParse)
	apiGroup.GET("/parse/:sessionId/status", h.HandleParseStatus)
	apiGroup.GET("/parse/:sessionId/entries", h.HandleParseEntries)
	apiGroup.GET("/parse/:sessionId/chunk", h.HandleParseChunk)
	apiGroup.GET("/parse/:sessionId/signals", h.HandleGetSignals)

	// Config
	// Map Layout
	apiGroup.GET("/map/layout", h.HandleGetMapLayout)
	apiGroup.POST("/map/upload", h.HandleUploadMapLayout)
	apiGroup.GET("/map/rules", h.HandleGetMapRules)
	apiGroup.POST("/map/rules", h.HandleUploadMapRules)
	apiGroup.GET("/map/files/recent", h.HandleRecentMapFiles)

	// Carrier log for map tracking
	apiGroup.POST("/map/carrier-log", h.HandleUploadCarrierLog)
	apiGroup.GET("/map/carrier-log", h.HandleGetCarrierLog)
	apiGroup.GET("/map/carrier-log/entries", h.HandleGetCarrierEntries)

	apiGroup.GET("/config/validation-rules", h.HandleGetValidationRules)
	apiGroup.PUT("/config/validation-rules", h.HandleUpdateValidationRules)

	// Start server
	e.Logger.Fatal(e.Start(":8089"))
}
