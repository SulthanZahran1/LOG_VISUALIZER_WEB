package parser

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
	
	// Cache for total counts by filter to avoid repeated COUNT queries
	countCache     map[string]int
	countCacheMu   sync.RWMutex
	
	// Semaphore to limit concurrent queries (prevents memory spikes during rapid scrolling)
	querySem chan struct{}
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
		db:         db,
		dbPath:     dbPath,
		batchSize:  50000, // 50K entries per batch for high performance with Appender
		batch:      make([]*models.LogEntry, 0, 50000),
		signals:    make(map[string]struct{}, 1000),
		devices:    make(map[string]struct{}, 100),
		minTs:      0,
		maxTs:      0,
		countCache: make(map[string]int),
		querySem:   make(chan struct{}, 3), // Max 3 concurrent queries
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

	fmt.Printf("[DuckStore] Finalizing: Creating indexes for %d entries...\n", ds.entryCount)
	start := time.Now()

	// Apply memory limit before heavy index creation (1.5GB limit)
	// This helps prevent OOM kills in Docker environments
	_, err := ds.db.Exec("PRAGMA memory_limit='1536MB'")
	if err != nil {
		fmt.Printf("[DuckStore] Warning: failed to set memory limit: %v\n", err)
	}

	// Create index on timestamp for efficient chunk queries
	_, err = ds.db.Exec("CREATE INDEX idx_ts ON entries(timestamp)")
	if err != nil {
		return fmt.Errorf("idx_ts creation failed: %w", err)
	}

	// Create indexes for filtering if there are many entries
	if ds.entryCount > 100000 {
		_, err = ds.db.Exec("CREATE INDEX idx_device ON entries(device_id)")
		if err != nil {
			fmt.Printf("[DuckStore] Warning: idx_device creation failed: %v\n", err)
		}
		_, err = ds.db.Exec("CREATE INDEX idx_signal ON entries(signal)")
		if err != nil {
			fmt.Printf("[DuckStore] Warning: idx_signal creation failed: %v\n", err)
		}
	}

	fmt.Printf("[DuckStore] Finalization complete in %v\n", time.Since(start))
	return nil
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

// QueryParams defines filters and sorting for log entry queries
type QueryParams struct {
	Search        string
	Category      string
	SortColumn    string
	SortDirection string // "asc" or "desc"
	SignalType    string
	ShowChanged   bool
}

// QueryEntries returns filtered, sorted, and paginated entries
func (ds *DuckStore) QueryEntries(params QueryParams, page, pageSize int) ([]models.LogEntry, int, error) {
	// Acquire semaphore to limit concurrent queries
	ds.querySem <- struct{}{}
	defer func() { <-ds.querySem }()

	where, args := ds.buildWhereClause(params)

	// Create cache key from where clause (filters determine count)
	cacheKey := where
	if cacheKey == "" {
		cacheKey = "__total__"
	}

	// Check cache for total count
	ds.countCacheMu.RLock()
	total, found := ds.countCache[cacheKey]
	ds.countCacheMu.RUnlock()

	// If not cached, run count query
	if !found {
		countQuery := "SELECT COUNT(*) FROM entries"
		if where != "" {
			countQuery += " WHERE " + where
		}

		err := ds.db.QueryRow(countQuery, args...).Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("count query failed: %w", err)
		}

		// Cache the count
		ds.countCacheMu.Lock()
		ds.countCache[cacheKey] = total
		ds.countCacheMu.Unlock()
	}

	if total == 0 {
		return []models.LogEntry{}, 0, nil
	}

	// Calculate offset
	offset := (page - 1) * pageSize

	// OPTIMIZATION: Use keyset pagination for deep pages to avoid OFFSET overhead
	// OFFSET is O(n) - the further you scroll, the slower it gets
	// Keyset pagination is O(log n) regardless of position
	entries, err := ds.queryWithKeysetPagination(params, pageSize, offset, where, args)
	if err != nil {
		return nil, 0, err
	}

	return entries, total, nil
}

// queryWithKeysetPagination uses efficient keyset pagination for deep pages
// Falls back to OFFSET for first few pages or complex sort orders
func (ds *DuckStore) queryWithKeysetPagination(params QueryParams, pageSize, offset int, where string, args []interface{}) ([]models.LogEntry, error) {
	// Determine sort column
	sortCol := "id"
	if params.SortColumn != "" {
		switch params.SortColumn {
		case "timestamp":
			sortCol = "timestamp"
		case "deviceId":
			sortCol = "device_id"
		case "signalName":
			sortCol = "signal"
		case "category":
			sortCol = "category"
		}
	}

	dir := "ASC"
	if params.SortDirection == "desc" {
		dir = "DESC"
	}

	// Use OFFSET for first 1000 rows (first 5 pages at 200/page) - it's fast enough
	// Use keyset pagination for deeper pages
	const offsetThreshold = 1000

	if offset < offsetThreshold || sortCol == "category" || sortCol == "signal" {
		// Simple OFFSET pagination for shallow pages or complex sorts
		query := `
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
		`
		if where != "" {
			query += " WHERE " + where
		}
		query += fmt.Sprintf(" ORDER BY %s %s LIMIT %d OFFSET %d", sortCol, dir, pageSize, offset)

		rows, err := ds.db.Query(query, args...)
		if err != nil {
			return nil, fmt.Errorf("query failed: %w", err)
		}
		defer rows.Close()

		return scanEntries(rows, pageSize)
	}

	// Keyset pagination for deep pages
	// Get the cursor value (id/timestamp) at the offset position
	var cursorQuery string
	if where != "" {
		cursorQuery = fmt.Sprintf("SELECT %s FROM entries WHERE %s ORDER BY %s %s LIMIT 1 OFFSET %d",
			sortCol, where, sortCol, dir, offset)
	} else {
		cursorQuery = fmt.Sprintf("SELECT %s FROM entries ORDER BY %s %s LIMIT 1 OFFSET %d",
			sortCol, sortCol, dir, offset)
	}

	var cursorValue interface{}
	err := ds.db.QueryRow(cursorQuery, args...).Scan(&cursorValue)
	if err == sql.ErrNoRows {
		// Beyond end of results
		return []models.LogEntry{}, nil
	}
	if err != nil {
		// Fall back to OFFSET if cursor query fails
		query := `
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
		`
		if where != "" {
			query += " WHERE " + where
		}
		query += fmt.Sprintf(" ORDER BY %s %s LIMIT %d OFFSET %d", sortCol, dir, pageSize, offset)

		rows, err := ds.db.Query(query, args...)
		if err != nil {
			return nil, fmt.Errorf("fallback query failed: %w", err)
		}
		defer rows.Close()
		return scanEntries(rows, pageSize)
	}

	// Now fetch rows starting from cursor value
	// Use (sort_col, id) as composite key for stable ordering
	var query string
	var queryArgs []interface{}

	if where != "" {
		query = fmt.Sprintf(`
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
			WHERE %s AND %s %s ?
			ORDER BY %s %s, id %s
			LIMIT %d
		`, where, sortCol, getComparisonOp(dir), sortCol, dir, dir, pageSize)
		queryArgs = append(args, cursorValue)
	} else {
		query = fmt.Sprintf(`
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
			WHERE %s %s ?
			ORDER BY %s %s, id %s
			LIMIT %d
		`, sortCol, getComparisonOp(dir), sortCol, dir, dir, pageSize)
		queryArgs = []interface{}{cursorValue}
	}

	rows, err := ds.db.Query(query, queryArgs...)
	if err != nil {
		// Fall back to OFFSET
		query := `
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
		`
		if where != "" {
			query += " WHERE " + where
		}
		query += fmt.Sprintf(" ORDER BY %s %s LIMIT %d OFFSET %d", sortCol, dir, pageSize, offset)

		rows, err := ds.db.Query(query, args...)
		if err != nil {
			return nil, fmt.Errorf("fallback query failed: %w", err)
		}
		defer rows.Close()
		return scanEntries(rows, pageSize)
	}
	defer rows.Close()

	return scanEntries(rows, pageSize)
}

func getComparisonOp(dir string) string {
	if dir == "DESC" {
		return "<"
	}
	return ">"
}

func scanEntries(rows *sql.Rows, capacity int) ([]models.LogEntry, error) {
	entries := make([]models.LogEntry, 0, capacity)
	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// ClearCountCache clears the count cache (call when data changes)
func (ds *DuckStore) ClearCountCache() {
	ds.countCacheMu.Lock()
	ds.countCache = make(map[string]int)
	ds.countCacheMu.Unlock()
}

// GetCategories returns all unique categories in the store
func (ds *DuckStore) GetCategories() ([]string, error) {
	rows, err := ds.db.Query("SELECT DISTINCT category FROM entries WHERE category IS NOT NULL AND category != '' ORDER BY category")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, nil
}

func (ds *DuckStore) buildWhereClause(params QueryParams) (string, []interface{}) {
	var clauses []string
	var args []interface{}

	if params.Search != "" {
		// Simple ILIKE search on signal/device/value
		searchPattern := "%" + params.Search + "%"
		clauses = append(clauses, "(device_id ILIKE ? OR signal ILIKE ? OR val_str ILIKE ?)")
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	if params.Category != "" {
		clauses = append(clauses, "category = ?")
		args = append(args, params.Category)
	}

	if params.SignalType != "" {
		// Map signal type string to TINYINT if needed, but for now we expect raw value or similar
		// Boolean=0, Int=1, Float=2, String=3
		var t int
		switch params.SignalType {
		case "boolean":
			t = 0
		case "integer":
			t = 1
		case "float":
			t = 2
		case "string":
			t = 3
		default:
			t = -1
		}
		if t != -1 {
			clauses = append(clauses, "val_type = ?")
			args = append(args, t)
		}
	}

	if len(clauses) == 0 {
		return "", nil
	}

	// Join all clauses with AND
	where := clauses[0]
	for i := 1; i < len(clauses); i++ {
		where += " AND " + clauses[i]
	}

	return where, args
}

// GetEntries returns a range of entries (for pagination)
func (ds *DuckStore) GetEntries(start, end int) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	ds.querySem <- struct{}{}
	defer func() { <-ds.querySem }()

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
// Optional signals parameter filters results to specific signals (deviceId::signalName).
func (ds *DuckStore) GetChunk(startTs, endTs time.Time, signals []string) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	ds.querySem <- struct{}{}
	defer func() { <-ds.querySem }()

	startMs := startTs.UnixMilli()
	endMs := endTs.UnixMilli()

	query := `
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM entries WHERE timestamp >= ? AND timestamp <= ?
	`
	var args []interface{}
	args = append(args, startMs, endMs)

	if len(signals) > 0 {
		var signalClauses []string
		for _, s := range signals {
			parts := strings.Split(s, "::")
			if len(parts) == 2 {
				signalClauses = append(signalClauses, "(device_id = ? AND signal = ?)")
				args = append(args, parts[0], parts[1])
			}
		}
		if len(signalClauses) > 0 {
			query += " AND (" + strings.Join(signalClauses, " OR ") + ")"
		}
	}

	query += " ORDER BY timestamp LIMIT 500000"

	// Safety limit: Don't return more than 500k entries in one chunk to avoid OOM
	rows, err := ds.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]models.LogEntry, 0, 1000)
	count := 0
	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
		count++
	}

	if count == 500000 {
		fmt.Printf("[DuckStore] Warning: GetChunk query truncated at 500,000 entries for range [%d, %d]\n", startMs, endMs)
	}

	return entries, rows.Err()
}

// GetValuesAtTime returns the most recent value for all signals at or before the given timestamp.
func (ds *DuckStore) GetValuesAtTime(ts time.Time, signals []string) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	ds.querySem <- struct{}{}
	defer func() { <-ds.querySem }()

	tsMs := ts.UnixMilli()

	// Use window function to get the latest entry for each signal
	query := `
		WITH latest_entries AS (
			SELECT 
				timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str,
				ROW_NUMBER() OVER(PARTITION BY device_id, signal ORDER BY timestamp DESC) as rn
			FROM entries
			WHERE timestamp <= ?
	`

	var args []interface{}
	args = append(args, tsMs)

	if len(signals) > 0 {
		var signalClauses []string
		for _, s := range signals {
			parts := strings.Split(s, "::")
			if len(parts) == 2 {
				signalClauses = append(signalClauses, "(device_id = ? AND signal = ?)")
				args = append(args, parts[0], parts[1])
			}
		}
		if len(signalClauses) > 0 {
			query += " AND (" + strings.Join(signalClauses, " OR ") + ")"
		}
	}

	query += `
		)
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM latest_entries
		WHERE rn = 1
	`

	rows, err := ds.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.LogEntry
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
