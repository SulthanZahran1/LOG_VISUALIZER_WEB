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

	// CORS configuration for frontend dev server
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept},
	}))

	// Routes
	apiGroup := e.Group("/api")

	// Health check
	apiGroup.GET("/health", h.HandleHealth)

	// File management
	apiGroup.POST("/files/upload", h.HandleUploadFile)
	apiGroup.GET("/files/recent", h.HandleRecentFiles)
	apiGroup.GET("/files/:id", h.HandleGetFile)
	apiGroup.DELETE("/files/:id", h.HandleDeleteFile)

	// Parse management
	apiGroup.POST("/parse", h.HandleStartParse)
	apiGroup.GET("/parse/:sessionId/status", h.HandleParseStatus)
	apiGroup.GET("/parse/:sessionId/entries", h.HandleParseEntries)
	apiGroup.GET("/parse/:sessionId/chunk", h.HandleParseChunk)

	// Config
	apiGroup.GET("/config/map", h.HandleGetMapConfig)
	apiGroup.GET("/config/validation-rules", h.HandleGetValidationRules)
	apiGroup.PUT("/config/validation-rules", h.HandleUpdateValidationRules)

	// Start server
	e.Logger.Fatal(e.Start(":8080"))
}
