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

	// Initialize API handler
	h := api.NewHandler(fileStore, sessionMgr, uploadMgr, cfg.GetDataDir())

	// Initialize WebSocket handler
	wsHandler := api.NewWebSocketHandler(h)

	// Load default rules on startup
	if err := h.LoadDefaultRules(); err != nil {
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

	// API Routes
	apiGroup := e.Group("/api")

	// Health check
	apiGroup.GET("/health", h.HandleHealth)

	// WebSocket endpoint
	apiGroup.GET("/ws/uploads", wsHandler.HandleWebSocket)

	// File management
	apiGroup.POST("/files/upload", h.HandleUploadFile)
	apiGroup.POST("/files/upload/binary", h.HandleUploadBinary)
	apiGroup.POST("/files/upload/chunk", h.HandleUploadChunk)
	apiGroup.POST("/files/upload/complete", h.HandleCompleteUpload)
	apiGroup.GET("/files/upload/:jobId/status", h.HandleUploadJobStream)
	apiGroup.GET("/files/recent", h.HandleRecentFiles)
	apiGroup.GET("/files/:id", h.HandleGetFile)

	// Conditional delete based on config
	if cfg.Security.AllowFileDeletion {
		apiGroup.DELETE("/files/:id", h.HandleDeleteFile)
	}

	apiGroup.PUT("/files/:id", h.HandleRenameFile)

	// Parse management
	apiGroup.POST("/parse", h.HandleStartParse)
	apiGroup.GET("/parse/:sessionId/status", h.HandleParseStatus)
	apiGroup.GET("/parse/:sessionId/progress", h.HandleParseProgressStream)
	apiGroup.GET("/parse/:sessionId/entries", h.HandleParseEntries)
	apiGroup.GET("/parse/:sessionId/entries/msgpack", h.HandleParseEntriesMsgpack)
	apiGroup.GET("/parse/:sessionId/stream", h.HandleParseStream)
	apiGroup.POST("/parse/:sessionId/chunk", h.HandleParseChunk)
	apiGroup.POST("/parse/:sessionId/chunk-boundaries", h.HandleParseChunkBoundaries)
	apiGroup.GET("/parse/:sessionId/signals", h.HandleGetSignals)
	apiGroup.GET("/parse/:sessionId/signal-types", h.HandleGetSignalTypes)
	apiGroup.GET("/parse/:sessionId/categories", h.HandleGetCategories)
	apiGroup.GET("/parse/:sessionId/at-time", h.HandleGetValuesAtTime)
	apiGroup.GET("/parse/:sessionId/index-of-time", h.HandleGetIndexByTime)
	apiGroup.GET("/parse/:sessionId/time-tree", h.HandleGetTimeTree)
	apiGroup.POST("/parse/:sessionId/keepalive", h.HandleSessionKeepAlive)

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

	// Carrier log
	apiGroup.POST("/map/carrier-log", h.HandleUploadCarrierLog)
	apiGroup.GET("/map/carrier-log", h.HandleGetCarrierLog)
	apiGroup.GET("/map/carrier-log/entries", h.HandleGetCarrierEntries)

	apiGroup.GET("/config/validation-rules", h.HandleGetValidationRules)
	apiGroup.PUT("/config/validation-rules", h.HandleUpdateValidationRules)

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

	if embeddedMode {
		fmt.Printf("Open http://localhost:%d in your browser\n\n", cfg.Server.Port)
	}

	e.Logger.Fatal(e.StartServer(s))
}
