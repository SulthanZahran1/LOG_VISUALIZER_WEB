// Package config provides XML-based configuration management for air-gapped deployment.
package config

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// AppConfig represents the root XML configuration structure
type AppConfig struct {
	XMLName xml.Name `xml:"PLCLogVisualizer"`
	
	// Server configuration
	Server ServerConfig `xml:"Server"`
	
	// Storage configuration
	Storage StorageConfig `xml:"Storage"`
	
	// Processing configuration
	Processing ProcessingConfig `xml:"Processing"`
	
	// Security configuration
	Security SecurityConfig `xml:"Security"`
	
	// Advanced options
	Advanced AdvancedConfig `xml:"Advanced"`
}

// ServerConfig contains HTTP server settings
type ServerConfig struct {
	Port           int    `xml:"Port"`
	BindAddress    string `xml:"BindAddress"`
	EnableCORS     bool   `xml:"EnableCORS"`
	AllowOrigins   string `xml:"AllowOrigins"`
	ReadTimeout    int    `xml:"ReadTimeoutSeconds"`
	WriteTimeout   int    `xml:"WriteTimeoutSeconds"`
	IdleTimeout    int    `xml:"IdleTimeoutSeconds"`
	BodyLimit      string `xml:"BodyLimit"`
}

// StorageConfig contains file storage settings
type StorageConfig struct {
	DataDirectory       string `xml:"DataDirectory"`
	UploadsDirectory    string `xml:"UploadsDirectory"`
	TempDirectory       string `xml:"TempDirectory"`
	ParsedDataDirectory string `xml:"ParsedDataDirectory"`
	MaxUploadSize       string `xml:"MaxUploadSize"`
	EnablePersistence   bool   `xml:"EnablePersistence"`
}

// ProcessingConfig contains parsing and processing settings
type ProcessingConfig struct {
	MaxConcurrentParses  int  `xml:"MaxConcurrentParses"`
	SessionTimeoutMinutes int `xml:"SessionTimeoutMinutes"`
	CleanupIntervalMinutes int `xml:"CleanupIntervalMinutes"`
	EnableCompression    bool `xml:"EnableCompression"`
	CompressionLevel     int  `xml:"CompressionLevel"`
	MaxMemoryPerSession  string `xml:"MaxMemoryPerSession"`
}

// SecurityConfig contains security settings
type SecurityConfig struct {
	AllowFileDeletion    bool   `xml:"AllowFileDeletion"`
	RequireAuth          bool   `xml:"RequireAuthentication"`
	AuthToken            string `xml:"AuthToken"`
	AllowedFileTypes     string `xml:"AllowedFileTypes"`
}

// AdvancedConfig contains advanced/tuning options
type AdvancedConfig struct {
	LogLevel            string `xml:"LogLevel"`
	EnableRequestLogging bool  `xml:"EnableRequestLogging"`
	DuckDBThreads       int    `xml:"DuckDBThreads"`
	DuckDBMemoryLimit   string `xml:"DuckDBMemoryLimit"`
	WebSocketMaxMessageSize int `xml:"WebSocketMaxMessageSizeKB"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *AppConfig {
	return &AppConfig{
		Server: ServerConfig{
			Port:         8089,
			BindAddress:  "0.0.0.0",
			EnableCORS:   true,
			AllowOrigins: "*",
			ReadTimeout:  30,
			WriteTimeout: 30,
			IdleTimeout:  120,
			BodyLimit:    "2G",
		},
		Storage: StorageConfig{
			DataDirectory:       "./data",
			UploadsDirectory:    "./data/uploads",
			TempDirectory:       "./data/temp",
			ParsedDataDirectory: "./data/parsed",
			MaxUploadSize:       "2G",
			EnablePersistence:   true,
		},
		Processing: ProcessingConfig{
			MaxConcurrentParses:    3,
			SessionTimeoutMinutes:  30,
			CleanupIntervalMinutes: 5,
			EnableCompression:      true,
			CompressionLevel:       5,
			MaxMemoryPerSession:    "1GB",
		},
		Security: SecurityConfig{
			AllowFileDeletion: true,
			RequireAuth:       false,
			AuthToken:         "",
			AllowedFileTypes:  ".csv,.log,.txt,.mcs,.xml,.yaml,.yml,.gz,.zip",
		},
		Advanced: AdvancedConfig{
			LogLevel:                 "info",
			EnableRequestLogging:     true,
			DuckDBThreads:            4,
			DuckDBMemoryLimit:        "1GB",
			WebSocketMaxMessageSize:  65536,
		},
	}
}

// LoadConfig loads configuration from XML file
func LoadConfig(configPath string) (*AppConfig, error) {
	// If file doesn't exist, create default
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		config := DefaultConfig()
		if err := config.Save(configPath); err != nil {
			return nil, fmt.Errorf("failed to create default config: %w", err)
		}
		return config, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	config := &AppConfig{}
	if err := xml.Unmarshal(data, config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Apply environment variable overrides
	config.applyEnvironmentOverrides()

	// Resolve relative paths
	config.resolvePaths(filepath.Dir(configPath))

	return config, nil
}

// Save saves the configuration to XML file
func (c *AppConfig) Save(configPath string) error {
	output, err := xml.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	header := []byte(xml.Header + "\n<!-- PLC Log Visualizer Configuration -->\n<!-- This file is auto-generated on first run -->\n\n")
	content := append(header, output...)

	if err := os.WriteFile(configPath, content, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// applyEnvironmentOverrides allows environment variables to override config values
func (c *AppConfig) applyEnvironmentOverrides() {
	// PORT override
	if port := os.Getenv("PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			c.Server.Port = p
		}
	}

	// DATA_DIR override
	if dataDir := os.Getenv("DATA_DIR"); dataDir != "" {
		c.Storage.DataDirectory = dataDir
	}

	// DUCKDB_TEMP_DIR override (special handling)
	if tempDir := os.Getenv("DUCKDB_TEMP_DIR"); tempDir != "" {
		c.Storage.TempDirectory = tempDir
	}
}

// resolvePaths converts relative paths to absolute based on config file location
func (c *AppConfig) resolvePaths(configDir string) {
	if !filepath.IsAbs(c.Storage.DataDirectory) {
		c.Storage.DataDirectory = filepath.Join(configDir, c.Storage.DataDirectory)
	}
	if !filepath.IsAbs(c.Storage.UploadsDirectory) {
		c.Storage.UploadsDirectory = filepath.Join(configDir, c.Storage.UploadsDirectory)
	}
	if !filepath.IsAbs(c.Storage.TempDirectory) {
		c.Storage.TempDirectory = filepath.Join(configDir, c.Storage.TempDirectory)
	}
	if !filepath.IsAbs(c.Storage.ParsedDataDirectory) {
		c.Storage.ParsedDataDirectory = filepath.Join(configDir, c.Storage.ParsedDataDirectory)
	}
}

// GetDataDir returns the absolute data directory path
func (c *AppConfig) GetDataDir() string {
	return c.Storage.DataDirectory
}

// GetUploadDir returns the absolute uploads directory path
func (c *AppConfig) GetUploadDir() string {
	return c.Storage.UploadsDirectory
}

// GetServerAddr returns the server bind address
func (c *AppConfig) GetServerAddr() string {
	return fmt.Sprintf("%s:%d", c.Server.BindAddress, c.Server.Port)
}

// EnsureDirectories creates all necessary directories
func (c *AppConfig) EnsureDirectories() error {
	dirs := []string{
		c.Storage.DataDirectory,
		c.Storage.UploadsDirectory,
		c.Storage.TempDirectory,
		c.Storage.ParsedDataDirectory,
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}
