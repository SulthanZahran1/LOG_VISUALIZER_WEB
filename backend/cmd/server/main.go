package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/plc-visualizer/backend/internal/api"
	"github.com/plc-visualizer/backend/internal/config"
	"github.com/plc-visualizer/backend/internal/session"
	"github.com/plc-visualizer/backend/internal/storage"
	"github.com/plc-visualizer/backend/internal/upload"
	"github.com/plc-visualizer/backend/internal/web"
)

// Version info (set during build)
var (
	Version   = "dev"
	BuildTime = "unknown"
)

func main() {
	// Get the executable's directory for config resolution
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("Failed to get executable path: %v\n", err)
		os.Exit(1)
	}
	exeDir := filepath.Dir(exePath)

	// Load XML configuration
	configPath := filepath.Join(exeDir, "PLCLogVisualizer.exe.config")
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Ensure all data directories exist
	if err := cfg.EnsureDirectories(); err != nil {
		fmt.Printf("Failed to create directories: %v\n", err)
		os.Exit(1)
	}

	// Check if running in embedded mode (frontend built into binary)
	embeddedMode := web.HasEmbeddedFiles()

	// Initialize storage
	fileStore, err := storage.NewLocalStore(cfg.GetUploadDir())
	if err != nil {
		fmt.Printf("Failed to initialize storage: %v\n", err)
		os.Exit(1)
	}

	// Initialize session manager
	sessionMgr := session.NewManager()

	// Start background session cleanup
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.Processing.CleanupIntervalMinutes) * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				sessionMgr.CleanupOldSessions(time.Duration(cfg.Processing.SessionTimeoutMinutes) * time.Minute)
			}
		}
	}()

	// Initialize upload processing manager
	uploadMgr := upload.NewManager(cfg.GetUploadDir(), fileStore)

	// Initialize handler dependencies
	deps := &api.Dependencies{
		Store:      fileStore,
		SessionMgr: sessionMgr,
		UploadMgr:  uploadMgr,
		DataDir:    cfg.GetDataDir(),
		Version:    Version,
	}

	// Create all handlers using the new modular structure
	handlers := api.NewHandlers(deps)

	// Initialize WebSocket handler using new handler structure
	wsHandler := api.NewWebSocketHandler(deps, handlers)

	// Load default rules on startup
	if err := handlers.Map.LoadDefaultRules(); err != nil {
		fmt.Printf("Warning: failed to load default rules: %v\n", err)
	} else {
		fmt.Println("Default rules loaded successfully")
	}

	e := echo.New()

	// Configure middleware
	e.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{
		Skipper: func(c echo.Context) bool {
			// Skip logging if disabled in config
			if !cfg.Advanced.EnableRequestLogging {
				return true
			}
			path := c.Request().URL.Path
			return strings.HasSuffix(path, "/status") ||
				strings.HasSuffix(path, "/progress") ||
				path == "/api/health"
		},
	}))

	e.Use(middleware.RecoverWithConfig(middleware.RecoverConfig{
		StackSize:         1024 * 4,
		DisablePrintStack: false,
		LogLevel:          0,
	}))

	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: time.Duration(cfg.Server.ReadTimeout) * time.Second,
		Skipper: func(c echo.Context) bool {
			path := c.Request().URL.Path
			return strings.Contains(path, "/stream") ||
				strings.Contains(path, "/upload") ||
				strings.Contains(path, "/entries") ||
				c.Request().Header.Get("Accept") == "text/event-stream"
		},
		ErrorMessage: "Request timeout - query took too long",
	}))

	// Compression middleware
	if cfg.Processing.EnableCompression {
		e.Use(middleware.GzipWithConfig(middleware.GzipConfig{
			Level: cfg.Processing.CompressionLevel,
			Skipper: func(c echo.Context) bool {
				return c.Request().Header.Get("Accept") == "text/event-stream"
			},
		}))
	}

	// Body limit middleware
	e.Use(middleware.BodyLimit(cfg.Server.BodyLimit))

	// CORS configuration
	if cfg.Server.EnableCORS {
		if embeddedMode {
			// In embedded mode, use config settings
			origins := strings.Split(cfg.Server.AllowOrigins, ",")
			for i := range origins {
				origins[i] = strings.TrimSpace(origins[i])
			}
			if len(origins) == 0 || (len(origins) == 1 && origins[0] == "") {
				origins = []string{"*"}
			}
			e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
				AllowOrigins: origins,
				AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
				AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
			}))
		} else {
			// Development mode - only allow localhost
			e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
				AllowOrigins: []string{
					"http://localhost:5173", "http://127.0.0.1:5173",
					"http://localhost:5174", "http://127.0.0.1:5174",
					"http://localhost:3000", "http://127.0.0.1:3000",
				},
				AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
				AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept},
			}))
		}
	}

	// API Routes - using the new modular handler structure
	apiGroup := e.Group("/api")

	// Health check
	apiGroup.GET("/health", handlers.Health.HandleHealth)

	// WebSocket endpoint (uses legacy handler)
	apiGroup.GET("/ws/uploads", wsHandler.HandleWebSocket)

	// File management routes (new handlers)
	apiGroup.POST("/files/upload", handlers.Upload.HandleUploadFile)
	apiGroup.POST("/files/upload/binary", handlers.Upload.HandleUploadBinary)
	apiGroup.POST("/files/upload/chunk", handlers.Upload.HandleUploadChunk)
	apiGroup.POST("/files/upload/complete", handlers.Upload.HandleCompleteUpload)
	apiGroup.GET("/files/upload/:jobId/status", handlers.Upload.HandleUploadJobStream)
	apiGroup.GET("/files/recent", handlers.Upload.HandleGetRecentFiles)
	apiGroup.GET("/files/:id", handlers.Upload.HandleGetFile)

	// Conditional delete based on config
	if cfg.Security.AllowFileDeletion {
		apiGroup.DELETE("/files/:id", handlers.Upload.HandleDeleteFile)
	}
	apiGroup.PUT("/files/:id", handlers.Upload.HandleRenameFile)

	// Parse management routes (new handlers)
	apiGroup.POST("/parse", handlers.Parse.HandleStartParse)
	apiGroup.GET("/parse/:sessionId/status", handlers.Parse.HandleParseStatus)
	apiGroup.GET("/parse/:sessionId/progress", handlers.Parse.HandleParseProgressStream)
	apiGroup.GET("/parse/:sessionId/entries", handlers.Parse.HandleParseEntries)
	apiGroup.GET("/parse/:sessionId/entries/msgpack", handlers.Parse.HandleParseEntriesMsgpack)
	apiGroup.GET("/parse/:sessionId/stream", handlers.Parse.HandleParseStream)
	apiGroup.POST("/parse/:sessionId/chunk", handlers.Parse.HandleParseChunk)
	apiGroup.POST("/parse/:sessionId/chunk-boundaries", handlers.Parse.HandleParseChunkBoundaries)
	apiGroup.GET("/parse/:sessionId/signals", handlers.Parse.HandleGetSignals)
	apiGroup.GET("/parse/:sessionId/signal-types", handlers.Parse.HandleGetSignalTypes)
	apiGroup.GET("/parse/:sessionId/categories", handlers.Parse.HandleGetCategories)
	apiGroup.GET("/parse/:sessionId/at-time", handlers.Parse.HandleGetValuesAtTime)
	apiGroup.GET("/parse/:sessionId/index-of-time", handlers.Parse.HandleGetIndexByTime)
	apiGroup.GET("/parse/:sessionId/time-tree", handlers.Parse.HandleGetTimeTree)
	apiGroup.POST("/parse/:sessionId/keepalive", handlers.Parse.HandleSessionKeepAlive)

	// Map Layout routes (new handlers)
	apiGroup.GET("/map/layout", handlers.Map.HandleGetMapLayout)
	apiGroup.POST("/map/upload", handlers.Map.HandleUploadMapLayout)
	apiGroup.POST("/map/active", handlers.Map.HandleSetActiveMap)
	apiGroup.GET("/map/rules", handlers.Map.HandleGetMapRules)
	apiGroup.POST("/map/rules", handlers.Map.HandleUploadMapRules)
	apiGroup.GET("/map/files/recent", handlers.Map.HandleRecentMapFiles)

	// Default maps (new handlers)
	apiGroup.GET("/map/defaults", handlers.Map.HandleGetDefaultMaps)
	apiGroup.POST("/map/defaults/load", handlers.Map.HandleLoadDefaultMap)

	// Carrier log routes (new handlers)
	apiGroup.POST("/map/carrier-log", handlers.Carrier.HandleUploadCarrierLog)
	apiGroup.GET("/map/carrier-log", handlers.Carrier.HandleGetCarrierLog)
	apiGroup.GET("/map/carrier-log/entries", handlers.Carrier.HandleGetCarrierEntries)

	// Validation rules (new handlers)
	apiGroup.GET("/config/validation-rules", handlers.Map.HandleGetValidationRules)
	apiGroup.PUT("/config/validation-rules", handlers.Map.HandleUpdateValidationRules)

	// Register embedded frontend if available
	if embeddedMode {
		if err := web.RegisterStaticRoutes(e); err != nil {
			fmt.Printf("Warning: failed to register static routes: %v\n", err)
		} else {
			fmt.Println("Serving embedded frontend from binary")
		}
	}

	// Configure server with settings from XML config
	s := &http.Server{
		Addr:         cfg.GetServerAddr(),
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(cfg.Server.IdleTimeout) * time.Second,
	}

	// Print startup banner
	mode := "Development"
	if embeddedMode {
		mode = "Air-Gapped (Embedded)"
	}

	fmt.Printf("\n")
	fmt.Printf("╔═══════════════════════════════════════════════════════════╗\n")
	fmt.Printf("║           PLC Log Visualizer Server                       ║\n")
	fmt.Printf("╠═══════════════════════════════════════════════════════════╣\n")
	fmt.Printf("║  Version:    %-45s║\n", Version)
	fmt.Printf("║  Build Time: %-45s║\n", BuildTime)
	fmt.Printf("║  Mode:       %-45s║\n", mode)
	fmt.Printf("╠═══════════════════════════════════════════════════════════╣\n")
	fmt.Printf("║  Config:    %-46s║\n", configPath)
	fmt.Printf("║  Listen:    http://%-38s║\n", cfg.GetServerAddr())
	fmt.Printf("║  Data Dir:  %-46s║\n", cfg.GetDataDir())
	fmt.Printf("╚═══════════════════════════════════════════════════════════╝\n")
	fmt.Printf("\n")
	fmt.Printf("✅ Week 1 Handlers: Integrated (modular handler structure)\n")
	fmt.Printf("\n")

	if embeddedMode {
		fmt.Printf("Open http://localhost:%d in your browser\n\n", cfg.Server.Port)
	}

	e.Logger.Fatal(e.StartServer(s))
}
