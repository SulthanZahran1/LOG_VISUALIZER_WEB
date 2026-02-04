package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/plc-visualizer/backend/internal/api"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
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

	// Initialize upload processing manager
	uploadMgr := upload.NewManager("./data/uploads", fileStore)

	// Initialize API handler
	h := api.NewHandler(fileStore, sessionMgr, uploadMgr)

	// Initialize WebSocket handler
	wsHandler := api.NewWebSocketHandler(h)

	// Load default rules on startup
	if err := h.LoadDefaultRules(); err != nil {
		fmt.Printf("Warning: failed to load default rules: %v\n", err)
	} else {
		fmt.Println("Default rules loaded successfully")
	}

	e := echo.New()

	// Middleware - skip logging for noisy polling endpoints
	e.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{
		Skipper: func(c echo.Context) bool {
			path := c.Request().URL.Path
			// Skip logging for frequent status polling requests
			return strings.HasSuffix(path, "/status") ||
				strings.HasSuffix(path, "/progress") ||
				path == "/api/health"
		},
	}))
	
	// Recovery with custom error handling
	e.Use(middleware.RecoverWithConfig(middleware.RecoverConfig{
		StackSize:         1024 * 4, // 4KB
		DisablePrintStack: false,
		LogLevel:          0, // ERROR level
	}))
	
	// Timeout middleware - prevents long-running queries from crashing the server
	// SSE streams and uploads are excluded from timeout
	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: 30 * time.Second,
		Skipper: func(c echo.Context) bool {
			// Skip timeout for SSE streams and upload endpoints
			path := c.Request().URL.Path
			return strings.Contains(path, "/stream") ||
				strings.Contains(path, "/upload") ||
				c.Request().Header.Get("Accept") == "text/event-stream"
		},
		ErrorMessage: "Request timeout - query took too long",
	}))
	
	e.Use(middleware.GzipWithConfig(middleware.GzipConfig{
		Level: 5, // Balanced compression/speed
		Skipper: func(c echo.Context) bool {
			// Skip compression for SSE streams (they handle their own streaming)
			return c.Request().Header.Get("Accept") == "text/event-stream"
		},
	}))
	e.Use(middleware.BodyLimit("2G"))

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

	// WebSocket endpoint for uploads
	apiGroup.GET("/ws/uploads", wsHandler.HandleWebSocket)

	// File management
	apiGroup.POST("/files/upload", h.HandleUploadFile)
	apiGroup.POST("/files/upload/binary", h.HandleUploadBinary)
	apiGroup.POST("/files/upload/chunk", h.HandleUploadChunk)
	apiGroup.POST("/files/upload/complete", h.HandleCompleteUpload)
	apiGroup.GET("/files/upload/:jobId/status", h.HandleUploadJobStream)
	apiGroup.GET("/files/recent", h.HandleRecentFiles)
	apiGroup.GET("/files/:id", h.HandleGetFile)
	apiGroup.DELETE("/files/:id", h.HandleDeleteFile)
	apiGroup.PUT("/files/:id", h.HandleRenameFile)

	// Parse management
	apiGroup.POST("/parse", h.HandleStartParse)
	apiGroup.GET("/parse/:sessionId/status", h.HandleParseStatus)
	apiGroup.GET("/parse/:sessionId/progress", h.HandleParseProgressStream)
	apiGroup.GET("/parse/:sessionId/entries", h.HandleParseEntries)
	apiGroup.GET("/parse/:sessionId/entries/msgpack", h.HandleParseEntriesMsgpack)
	apiGroup.GET("/parse/:sessionId/stream", h.HandleParseStream)
	apiGroup.GET("/parse/:sessionId/chunk", h.HandleParseChunk)
	apiGroup.GET("/parse/:sessionId/signals", h.HandleGetSignals)
	apiGroup.GET("/parse/:sessionId/categories", h.HandleGetCategories)
	apiGroup.GET("/parse/:sessionId/at-time", h.HandleGetValuesAtTime)

	// Config
	// Map Layout
	apiGroup.GET("/map/layout", h.HandleGetMapLayout)
	apiGroup.POST("/map/upload", h.HandleUploadMapLayout)
	apiGroup.POST("/map/active", h.HandleSetActiveMap)
	apiGroup.GET("/map/rules", h.HandleGetMapRules)
	apiGroup.POST("/map/rules", h.HandleUploadMapRules)
	apiGroup.GET("/map/files/recent", h.HandleRecentMapFiles)

	// Default maps
	apiGroup.GET("/map/defaults", h.HandleGetDefaultMaps)
	apiGroup.POST("/map/defaults/load", h.HandleLoadDefaultMap)

	// Carrier log for map tracking
	apiGroup.POST("/map/carrier-log", h.HandleUploadCarrierLog)
	apiGroup.GET("/map/carrier-log", h.HandleGetCarrierLog)
	apiGroup.GET("/map/carrier-log/entries", h.HandleGetCarrierEntries)

	apiGroup.GET("/config/validation-rules", h.HandleGetValidationRules)
	apiGroup.PUT("/config/validation-rules", h.HandleUpdateValidationRules)

	// Configure server with timeouts
	s := &http.Server{
		Addr:         ":8089",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	
	fmt.Println("Server starting on :8089")
	e.Logger.Fatal(e.StartServer(s))
}
