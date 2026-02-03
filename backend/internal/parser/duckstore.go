package parser

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/marcboeker/go-duckdb"
	"github.com/plc-visualizer/backend/internal/models"
)

// DuckStore stores log entries in a temporary DuckDB file for memory efficiency.
// This allows parsing files larger than available RAM.
type DuckStore struct {
	db         *sql.DB
	dbPath     string
	entryCount int
	batchSize  int
	batch      []*models.LogEntry
	signals    map[string]struct{}
	devices    map[string]struct{}
	minTs      int64
	maxTs      int64
	lastError  error // stores the last flush error
}

// NewDuckStore creates a new DuckDB-backed store in the given temp directory.
func NewDuckStore(tempDir string, sessionID string) (*DuckStore, error) {
	dbPath := filepath.Join(tempDir, fmt.Sprintf("session_%s.duckdb", sessionID))

	db, err := sql.Open("duckdb", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open DuckDB: %w", err)
	}

	// Create the entries table
	_, err = db.Exec(`
		CREATE TABLE entries (
			id        INTEGER PRIMARY KEY,
			timestamp BIGINT NOT NULL,
			device_id VARCHAR NOT NULL,
			signal    VARCHAR NOT NULL,
			category  VARCHAR,
			val_type  TINYINT NOT NULL,
			val_bool  BOOLEAN,
			val_int   BIGINT,
			val_float DOUBLE,
			val_str   VARCHAR
		)
	`)
	if err != nil {
		db.Close()
		os.Remove(dbPath)
		return nil, fmt.Errorf("failed to create table: %w", err)
	}

	return &DuckStore{
		db:        db,
		dbPath:    dbPath,
		batchSize: 50000, // 50K entries per batch for high performance with Appender
		batch:     make([]*models.LogEntry, 0, 50000),
		signals:   make(map[string]struct{}, 1000),
		devices:   make(map[string]struct{}, 100),
		minTs:     0,
		maxTs:     0,
	}, nil
}

// AddEntry adds an entry to the store. Entries are batched for efficient insertion.
func (ds *DuckStore) AddEntry(entry *models.LogEntry) {
	ds.batch = append(ds.batch, entry)

	// Track signals and devices
	sigKey := fmt.Sprintf("%s::%s", entry.DeviceID, entry.SignalName)
	ds.signals[sigKey] = struct{}{}
	ds.devices[entry.DeviceID] = struct{}{}

	// Track time range
	tsMs := entry.Timestamp.UnixMilli()
	if ds.entryCount == 0 || tsMs < ds.minTs {
		ds.minTs = tsMs
	}
	if tsMs > ds.maxTs {
		ds.maxTs = tsMs
	}

	ds.entryCount++

	if len(ds.batch) >= ds.batchSize {
		if err := ds.flushBatch(); err != nil {
			ds.lastError = err
			fmt.Printf("[DuckStore] flush error: %v\n", err)
		}
	}
}

// LastError returns the last error that occurred during batch flush
func (ds *DuckStore) LastError() error {
	return ds.lastError
}

// flushBatch writes the current batch to DuckDB using the native Appender API (very fast)
func (ds *DuckStore) flushBatch() error {
	if len(ds.batch) == 0 {
		return nil
	}

	batchNum := (ds.entryCount - 1) / ds.batchSize
	startTime := time.Now()
	fmt.Printf("[DuckStore] Flushing batch %d (%d entries) using Appender...\n", batchNum, len(ds.batch))

	// Get a single connection from the pool
	conn, err := ds.db.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer conn.Close()

	// Access the raw driver connection to use the Appender API
	err = conn.Raw(func(driverConn interface{}) error {
		dConn, ok := driverConn.(*duckdb.Conn)
		if !ok {
			return fmt.Errorf("failed to cast to duckdb.Conn")
		}

		appender, err := duckdb.NewAppenderFromConn(dConn, "", "entries")
		if err != nil {
			return fmt.Errorf("failed to create appender: %w", err)
		}
		defer appender.Close()

		baseID := ds.entryCount - len(ds.batch)
		for i, entry := range ds.batch {
			valType, valBool, valInt, valFloat, valStr := encodeValue(entry.Value)

			err := appender.AppendRow(
				int32(baseID+i),
				entry.Timestamp.UnixMilli(),
				entry.DeviceID,
				entry.SignalName,
				entry.Category,
				int8(valType),
				valBool,
				valInt,
				valFloat,
				valStr,
			)
			if err != nil {
				return fmt.Errorf("failed to append row %d: %w", i, err)
			}
		}

		return appender.Flush()
	})

	if err != nil {
		return fmt.Errorf("appender error: %w", err)
	}

	elapsed := time.Since(startTime)
	fmt.Printf("[DuckStore] Batch %d complete in %v\n", batchNum, elapsed)

	ds.batch = ds.batch[:0]
	return nil
}

// Finalize flushes any remaining entries and creates indexes
func (ds *DuckStore) Finalize() error {
	if err := ds.flushBatch(); err != nil {
		return err
	}

	// Create index on timestamp for efficient chunk queries
	_, err := ds.db.Exec("CREATE INDEX idx_ts ON entries(timestamp)")
	return err
}

// Len returns the total number of entries
func (ds *DuckStore) Len() int {
	return ds.entryCount
}

// GetEntry returns a single entry by index
func (ds *DuckStore) GetEntry(i int) (models.LogEntry, error) {
	row := ds.db.QueryRow(`
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM entries WHERE id = ?
	`, i)

	return scanEntry(row)
}

// GetEntries returns a range of entries (for pagination)
func (ds *DuckStore) GetEntries(start, end int) ([]models.LogEntry, error) {
	count := end - start
	if count <= 0 {
		return []models.LogEntry{}, nil
	}

	rows, err := ds.db.Query(`
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM entries WHERE id >= ? AND id < ? ORDER BY id
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]models.LogEntry, 0, count)
	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, rows.Err()
}

// GetChunk returns entries within a time range (startTs <= ts <= endTs)
func (ds *DuckStore) GetChunk(startTs, endTs time.Time) ([]models.LogEntry, error) {
	startMs := startTs.UnixMilli()
	endMs := endTs.UnixMilli()

	rows, err := ds.db.Query(`
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM entries WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp
	`, startMs, endMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]models.LogEntry, 0, 1000)
	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, rows.Err()
}

// GetSignals returns all unique signal keys
func (ds *DuckStore) GetSignals() map[string]struct{} {
	return ds.signals
}

// GetDevices returns all unique device IDs
func (ds *DuckStore) GetDevices() map[string]struct{} {
	return ds.devices
}

// GetTimeRange returns the time range of stored entries
func (ds *DuckStore) GetTimeRange() *models.TimeRange {
	if ds.entryCount == 0 {
		return nil
	}
	return &models.TimeRange{
		Start: time.UnixMilli(ds.minTs),
		End:   time.UnixMilli(ds.maxTs),
	}
}

// Close closes the database and removes the temp file
func (ds *DuckStore) Close() error {
	if ds.db != nil {
		ds.db.Close()
	}
	if ds.dbPath != "" {
		os.Remove(ds.dbPath)
	}
	return nil
}

// Value type constants
const (
	valTypeBool   = 0
	valTypeInt    = 1
	valTypeFloat  = 2
	valTypeString = 3
)

func encodeValue(val interface{}) (valType int, valBool bool, valInt int64, valFloat float64, valStr string) {
	switch v := val.(type) {
	case bool:
		return valTypeBool, v, 0, 0, ""
	case int:
		return valTypeInt, false, int64(v), 0, ""
	case int64:
		return valTypeInt, false, v, 0, ""
	case float64:
		return valTypeFloat, false, 0, v, ""
	case string:
		return valTypeString, false, 0, 0, v
	default:
		return valTypeString, false, 0, 0, fmt.Sprintf("%v", val)
	}
}

func decodeValue(valType int, valBool bool, valInt int64, valFloat float64, valStr string) interface{} {
	switch valType {
	case valTypeBool:
		return valBool
	case valTypeInt:
		return int(valInt)
	case valTypeFloat:
		return valFloat
	case valTypeString:
		return valStr
	default:
		return valStr
	}
}

func valTypeToSignalType(valType int) models.SignalType {
	switch valType {
	case valTypeBool:
		return models.SignalTypeBoolean
	case valTypeInt:
		return models.SignalTypeInteger
	case valTypeFloat, valTypeString:
		return models.SignalTypeString
	default:
		return models.SignalTypeString
	}
}

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanEntry(row *sql.Row) (models.LogEntry, error) {
	var tsMs int64
	var deviceID, signal, category string
	var valType int
	var valBool sql.NullBool
	var valInt sql.NullInt64
	var valFloat sql.NullFloat64
	var valStr sql.NullString

	err := row.Scan(&tsMs, &deviceID, &signal, &category, &valType, &valBool, &valInt, &valFloat, &valStr)
	if err != nil {
		return models.LogEntry{}, err
	}

	return models.LogEntry{
		Timestamp:  time.UnixMilli(tsMs),
		DeviceID:   deviceID,
		SignalName: signal,
		Category:   category,
		Value:      decodeValue(valType, valBool.Bool, valInt.Int64, valFloat.Float64, valStr.String),
		SignalType: valTypeToSignalType(valType),
	}, nil
}

func scanEntryRows(rows *sql.Rows) (models.LogEntry, error) {
	var tsMs int64
	var deviceID, signal, category string
	var valType int
	var valBool sql.NullBool
	var valInt sql.NullInt64
	var valFloat sql.NullFloat64
	var valStr sql.NullString

	err := rows.Scan(&tsMs, &deviceID, &signal, &category, &valType, &valBool, &valInt, &valFloat, &valStr)
	if err != nil {
		return models.LogEntry{}, err
	}

	return models.LogEntry{
		Timestamp:  time.UnixMilli(tsMs),
		DeviceID:   deviceID,
		SignalName: signal,
		Category:   category,
		Value:      decodeValue(valType, valBool.Bool, valInt.Int64, valFloat.Float64, valStr.String),
		SignalType: valTypeToSignalType(valType),
	}, nil
}
