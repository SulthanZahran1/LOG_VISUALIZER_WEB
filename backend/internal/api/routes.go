// routes.go - Route registration helpers
// This file provides a clean way to register all API routes
package api

import (
	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
)

// Dependencies holds all handler dependencies
type Dependencies struct {
	Store      storage.Store
	SessionMgr *session.Manager
	UploadMgr  *upload.Manager
	DataDir    string
	Version    string
}

// Handlers holds all handler instances
type Handlers struct {
	Health    HealthHandler
	Upload    UploadHandler
	Parse     ParseHandler
	Map       MapHandler
	Carrier   CarrierHandler
	UploadJob UploadJobHandler
}

// NewHandlers creates all handler instances
func NewHandlers(deps *Dependencies) *Handlers {
	return &Handlers{
		Health:  NewHealthHandler(deps.Version),
		Upload:  NewUploadHandler(deps.Store, deps.SessionMgr, deps.UploadMgr),
		Parse:   NewParseHandler(deps.Store, deps.SessionMgr),
		Map:     NewMapHandler(deps.Store, deps.DataDir),
		Carrier: NewCarrierHandler(deps.Store),
		// UploadJob handler would be created here if needed
	}
}

// RegisterRoutes registers all API routes with the Echo instance
func RegisterRoutes(e *echo.Echo, handlers *Handlers) {
	// Health check
	e.GET("/health", handlers.Health.HandleHealth)

	// File upload routes
	uploadGroup := e.Group("/api/files")
	uploadGroup.POST("/upload", handlers.Upload.HandleUploadFile)
	uploadGroup.POST("/upload/chunk", handlers.Upload.HandleUploadChunk)
	uploadGroup.POST("/upload/complete", handlers.Upload.HandleCompleteUpload)
	uploadGroup.POST("/upload/binary", handlers.Upload.HandleUploadBinary)
	uploadGroup.GET("/recent", handlers.Upload.HandleGetRecentFiles)
	uploadGroup.GET("/:id", handlers.Upload.HandleGetFile)
	uploadGroup.DELETE("/:id", handlers.Upload.HandleDeleteFile)
	uploadGroup.PUT("/:id", handlers.Upload.HandleRenameFile)

	// Parse session routes
	parseGroup := e.Group("/api/parse")
	parseGroup.POST("", handlers.Parse.HandleStartParse)
	parseGroup.GET("/:sessionId/status", handlers.Parse.HandleParseStatus)
	parseGroup.POST("/:sessionId/keepalive", handlers.Parse.HandleSessionKeepAlive)
	parseGroup.GET("/:sessionId/progress", handlers.Parse.HandleParseProgressStream)
	parseGroup.GET("/:sessionId/entries", handlers.Parse.HandleParseEntries)
	parseGroup.GET("/:sessionId/entries/msgpack", handlers.Parse.HandleParseEntriesMsgpack)
	parseGroup.GET("/:sessionId/stream", handlers.Parse.HandleParseStream)
	parseGroup.GET("/:sessionId/chunk", handlers.Parse.HandleParseChunk)
	parseGroup.GET("/:sessionId/chunk/boundaries", handlers.Parse.HandleParseChunkBoundaries)
	parseGroup.GET("/:sessionId/signals", handlers.Parse.HandleGetSignals)
	parseGroup.GET("/:sessionId/signals/types", handlers.Parse.HandleGetSignalTypes)
	parseGroup.GET("/:sessionId/categories", handlers.Parse.HandleGetCategories)
	parseGroup.GET("/:sessionId/index", handlers.Parse.HandleGetIndexByTime)
	parseGroup.GET("/:sessionId/timetree", handlers.Parse.HandleGetTimeTree)
	parseGroup.GET("/:sessionId/values", handlers.Parse.HandleGetValuesAtTime)

	// Map configuration routes
	mapGroup := e.Group("/api/map")
	mapGroup.GET("/layout", handlers.Map.HandleGetMapLayout)
	mapGroup.POST("/upload", handlers.Map.HandleUploadMapLayout)
	mapGroup.POST("/active", handlers.Map.HandleSetActiveMap)
	mapGroup.POST("/rules/upload", handlers.Map.HandleUploadMapRules)
	mapGroup.GET("/rules", handlers.Map.HandleGetMapRules)
	mapGroup.GET("/files/recent", handlers.Map.HandleRecentMapFiles)
	mapGroup.GET("/defaults", handlers.Map.HandleGetDefaultMaps)
	mapGroup.POST("/defaults/load", handlers.Map.HandleLoadDefaultMap)
	mapGroup.GET("/validation", handlers.Map.HandleGetValidationRules)
	mapGroup.POST("/validation", handlers.Map.HandleUpdateValidationRules)

	// Carrier tracking routes
	carrierGroup := e.Group("/api/map/carrier-log")
	carrierGroup.POST("", handlers.Carrier.HandleUploadCarrierLog)
	carrierGroup.GET("", handlers.Carrier.HandleGetCarrierLog)
	carrierGroup.GET("/entries", handlers.Carrier.HandleGetCarrierEntries)
}

// RegisterWebSocketRoutes registers WebSocket routes
func RegisterWebSocketRoutes(e *echo.Echo, handlers *Handlers) {
	// WebSocket routes would be registered here
	// e.GET("/api/ws/uploads", handleWebSocket)
}

// SetupMiddleware configures common middleware
func SetupMiddleware(e *echo.Echo) {
	// Use custom error handler
	e.HTTPErrorHandler = ErrorHandler

	// Add CORS middleware if needed
	// e.Use(middleware.CORS())

	// Add request logging
	// e.Use(middleware.Logger())

	// Add recovery
	// e.Use(middleware.Recover())
}
