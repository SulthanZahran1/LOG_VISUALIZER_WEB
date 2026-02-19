// interfaces.go - Handler interface definitions for clean separation of concerns
package api

import (
	"context"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/parser"
)

// UploadHandler handles file upload operations
type UploadHandler interface {
	HandleUploadFile(c echo.Context) error
	HandleUploadChunk(c echo.Context) error
	HandleCompleteUpload(c echo.Context) error
	HandleUploadBinary(c echo.Context) error
	HandleGetRecentFiles(c echo.Context) error
	HandleGetFile(c echo.Context) error
	HandleDeleteFile(c echo.Context) error
	HandleRenameFile(c echo.Context) error
}

// ParseHandler handles parsing session operations
type ParseHandler interface {
	HandleStartParse(c echo.Context) error
	HandleParseStatus(c echo.Context) error
	HandleParseProgressStream(c echo.Context) error
	HandleParseEntries(c echo.Context) error
	HandleParseEntriesMsgpack(c echo.Context) error
	HandleParseStream(c echo.Context) error
	HandleParseChunk(c echo.Context) error
	HandleParseChunkBoundaries(c echo.Context) error
	HandleGetSignals(c echo.Context) error
	HandleGetSignalTypes(c echo.Context) error
	HandleGetCategories(c echo.Context) error
	HandleGetIndexByTime(c echo.Context) error
	HandleGetTimeTree(c echo.Context) error
	HandleGetValuesAtTime(c echo.Context) error
	HandleSessionKeepAlive(c echo.Context) error
}

// MapHandler handles map configuration operations
type MapHandler interface {
	HandleGetMapLayout(c echo.Context) error
	HandleUploadMapLayout(c echo.Context) error
	HandleSetActiveMap(c echo.Context) error
	HandleUploadMapRules(c echo.Context) error
	HandleGetMapRules(c echo.Context) error
	HandleRecentMapFiles(c echo.Context) error
	HandleGetDefaultMaps(c echo.Context) error
	HandleLoadDefaultMap(c echo.Context) error
	HandleGetValidationRules(c echo.Context) error
	HandleUpdateValidationRules(c echo.Context) error
	GetCurrentMap() string
	SetCurrentMap(mapID string)
	GetCurrentRules() (string, *models.MapRules)
	SetCurrentRules(rulesID string, rules *models.MapRules)
}

// CarrierHandler handles carrier tracking operations
type CarrierHandler interface {
	HandleUploadCarrierLog(c echo.Context) error
	HandleGetCarrierLog(c echo.Context) error
	HandleGetCarrierEntries(c echo.Context) error
	GetCarrierSessionID() string
	SetCarrierSessionID(sessionID string)
}

// HealthHandler handles health check operations
type HealthHandler interface {
	HandleHealth(c echo.Context) error
}

// UploadJobHandler handles upload job streaming
type UploadJobHandler interface {
	HandleUploadJobStream(c echo.Context) error
}

// SessionManager defines the interface for session management
// This allows mocking in tests
type SessionManager interface {
	StartMultiSession(fileIDs []string, filePaths []string) (*models.ParseSession, error)
	GetSession(id string) (*models.ParseSession, bool)
	TouchSession(id string) bool
	DeleteParsedFile(fileID string) error
	GetEntries(ctx context.Context, id string, page, pageSize int) ([]models.LogEntry, int, bool)
	QueryEntries(ctx context.Context, id string, params parser.QueryParams, page, pageSize int) ([]models.LogEntry, int, bool)
	GetChunk(ctx context.Context, id string, start, end time.Time, signals []string) ([]models.LogEntry, bool)
	GetBoundaryValues(ctx context.Context, id string, start, end time.Time, signals []string) (*parser.BoundaryValues, bool)
	GetSignals(id string) ([]string, bool)
	GetSignalTypes(id string) (map[string]string, bool)
	GetCategories(ctx context.Context, id string) ([]string, bool)
	GetIndexByTime(ctx context.Context, id string, params parser.QueryParams, ts int64) (int, bool)
	GetTimeTree(ctx context.Context, id string, params parser.QueryParams) ([]parser.TimeTreeEntry, bool)
	GetValuesAtTime(ctx context.Context, id string, ts time.Time, signals []string) ([]models.LogEntry, bool)
}


