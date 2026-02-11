package parser

import (
	"context"
	"database/sql"
	"database/sql/driver"
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
	countCache   map[string]int
	countCacheMu sync.RWMutex

	// Semaphore to limit concurrent queries (prevents memory spikes during rapid scrolling)
	querySem chan struct{}

	// Cache of ordered id lists for filtered pagination.
	// Key: "where|sort|dir|args" — Value: ordered slice of matching row ids.
	// First request builds the cache (one scan), subsequent pages use primary key lookup.
	pageIndex   map[string][]int32
	pageIndexMu sync.RWMutex

	// persistent means Close() should not delete the database file.
	// Set for parsed files stored in the persistent cache.
	persistent bool
}

// NewDuckStore creates a new DuckDB-backed store in the given temp directory.
func NewDuckStore(tempDir string, sessionID string) (*DuckStore, error) {
	dbPath := filepath.Join(tempDir, fmt.Sprintf("session_%s.duckdb", sessionID))
	return NewDuckStoreAtPath(dbPath)
}

// NewDuckStoreAtPath creates a new DuckDB-backed store at a specific path.
// Used for persistent storage of parsed files.
func NewDuckStoreAtPath(dbPath string) (*DuckStore, error) {
	fmt.Printf("[DuckStore] Creating database at: %s\n", dbPath)

	// Open with optimized settings for large datasets
	fmt.Printf("[DuckStore] Creating DuckDB connector...\n")
	connector, err := duckdb.NewConnector(dbPath, func(execer driver.ExecerContext) error {
		// Set memory limit and other pragmas
		pragmas := []string{
			"PRAGMA memory_limit='1GB'",
			"PRAGMA threads=4",
			"PRAGMA enable_progress_bar=false",
		}
		for _, pragma := range pragmas {
			fmt.Printf("[DuckStore] Executing: %s\n", pragma)
			if _, err := execer.ExecContext(context.Background(), pragma, nil); err != nil {
				fmt.Printf("[DuckStore] Pragma error: %v\n", err)
				return err
			}
		}
		return nil
	})
	if err != nil {
		fmt.Printf("[DuckStore] ERROR creating connector: %v\n", err)
		return nil, fmt.Errorf("failed to create DuckDB connector: %w", err)
	}
	fmt.Printf("[DuckStore] Connector created successfully\n")

	db := sql.OpenDB(connector)
	fmt.Printf("[DuckStore] Database opened, creating table...\n")

	// Create the entries table with optimized schema
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
		fmt.Printf("[DuckStore] ERROR creating table: %v\n", err)
		db.Close()
		os.Remove(dbPath)
		return nil, fmt.Errorf("failed to create table: %w", err)
	}
	fmt.Printf("[DuckStore] Table created successfully\n")

	// NOTE: Indexes are created in Finalize() after all inserts for better performance.
	// Creating indexes during inserts significantly slows down the parsing phase.

	fmt.Printf("[DuckStore] Initialization complete, ready for inserts\n")
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
		pageIndex:  make(map[string][]int32),
		querySem:   make(chan struct{}, 3), // Max 3 concurrent queries
	}, nil
}

// OpenDuckStoreReadOnly opens an existing DuckDB file in read-only mode.
// Used for loading previously parsed files from persistent storage.
// Read-only mode allows multiple processes to access the same file without locking conflicts.
func OpenDuckStoreReadOnly(dbPath string) (*DuckStore, error) {
	fmt.Printf("[DuckStore] Opening existing database (read-only) at: %s\n", dbPath)

	// Open with read-only mode to avoid file locking issues
	// This allows multiple processes/connections to read the same database
	readOnlyPath := dbPath + "?access_mode=read_only"
	connector, err := duckdb.NewConnector(readOnlyPath, func(execer driver.ExecerContext) error {
		// Set pragmas optimized for read-only queries
		pragmas := []string{
			"PRAGMA memory_limit='1GB'",
			"PRAGMA threads=4",
			"PRAGMA enable_progress_bar=false",
		}
		for _, pragma := range pragmas {
			if _, err := execer.ExecContext(context.Background(), pragma, nil); err != nil {
				fmt.Printf("[DuckStore] Pragma warning: %v\n", err)
				// Non-fatal - continue even if pragma fails
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open DuckDB connector: %w", err)
	}

	db := sql.OpenDB(connector)

	// Get entry count
	var entryCount int
	err = db.QueryRow("SELECT COUNT(*) FROM entries").Scan(&entryCount)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to get entry count: %w", err)
	}

	// Get time range
	var minTs, maxTs int64
	err = db.QueryRow("SELECT MIN(timestamp), MAX(timestamp) FROM entries").Scan(&minTs, &maxTs)
	if err != nil {
		// Non-fatal - may be empty table
		minTs, maxTs = 0, 0
	}

	// Get all unique signals and devices
	signals := make(map[string]struct{})
	devices := make(map[string]struct{})

	rows, err := db.Query("SELECT DISTINCT device_id, signal FROM entries")
	if err == nil {
		for rows.Next() {
			var deviceID, signal string
			if err := rows.Scan(&deviceID, &signal); err == nil {
				signals[deviceID+"::"+signal] = struct{}{}
				devices[deviceID] = struct{}{}
			}
		}
		rows.Close()
	}

	fmt.Printf("[DuckStore] Opened existing DB: %d entries, %d signals, %d devices\n",
		entryCount, len(signals), len(devices))

	return &DuckStore{
		db:         db,
		dbPath:     dbPath,
		entryCount: entryCount,
		batchSize:  50000,
		batch:      make([]*models.LogEntry, 0),
		signals:    signals,
		devices:    devices,
		minTs:      minTs,
		maxTs:      maxTs,
		countCache: make(map[string]int),
		pageIndex:  make(map[string][]int32),
		querySem:   make(chan struct{}, 3),
		persistent: true, // Read-only stores should never delete the file
	}, nil
}

// AddEntry adds an entry to the store. Entries are batched for efficient insertion.
func (ds *DuckStore) AddEntry(entry *models.LogEntry) {
	ds.batch = append(ds.batch, entry)

	// Track signals and devices (use string concatenation instead of fmt.Sprintf for speed)
	sigKey := entry.DeviceID + "::" + entry.SignalName
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
		// Composite index for efficient boundary queries (last value before / first value after)
		_, err = ds.db.Exec("CREATE INDEX idx_signal_ts ON entries(device_id, signal, timestamp)")
		if err != nil {
			fmt.Printf("[DuckStore] Warning: idx_signal_ts creation failed: %v\n", err)
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
	Search              string
	Categories          []string // Multiple categories supported (IN clause)
	Signals             []string // Filter to specific signals (format: "deviceId::signalName")
	SortColumn          string
	SortDirection       string // "asc" or "desc"
	SignalType          string
	SearchRegex         bool
	SearchCaseSensitive bool
	ShowChanged         bool
}

// QueryEntries returns filtered, sorted, and paginated entries
func (ds *DuckStore) QueryEntries(ctx context.Context, params QueryParams, page, pageSize int) ([]models.LogEntry, int, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, 0, ctx.Err()
	}

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

		// Check context before query
		select {
		case <-ctx.Done():
			return nil, 0, ctx.Err()
		default:
		}

		err := ds.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
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
	entries, err := ds.queryWithKeysetPagination(ctx, params, pageSize, offset, where, args)
	if err != nil {
		return nil, 0, err
	}

	return entries, total, nil
}

// queryWithKeysetPagination uses efficient pagination for all page depths.
//
// Unfiltered + timestamp/id sort: direct primary key range scan — O(log n).
// Filtered or other sorts: builds a cached ordered id list on first request (one scan),
// then all subsequent pages use primary key IN lookup — O(pageSize).
func (ds *DuckStore) queryWithKeysetPagination(ctx context.Context, params QueryParams, pageSize, offset int, where string, args []interface{}) ([]models.LogEntry, error) {
	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

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

	// FAST PATH: For unfiltered queries sorted by timestamp or id (the default),
	// the sequential id column maps directly to row position. Use a primary key
	// range scan which is O(log n) regardless of depth — no OFFSET needed.
	if where == "" && (sortCol == "timestamp" || sortCol == "id") {
		var startID, endID int
		if dir == "ASC" {
			startID = offset
			endID = offset + pageSize
		} else {
			// DESC: position 0 = last row (id=entryCount-1)
			startID = ds.entryCount - offset - pageSize
			endID = ds.entryCount - offset
			if startID < 0 {
				startID = 0
			}
		}

		query := fmt.Sprintf(`
			SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
			FROM entries
			WHERE id >= %d AND id < %d
			ORDER BY id %s
		`, startID, endID, dir)

		rows, err := ds.db.QueryContext(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("primary key range query failed: %w", err)
		}
		defer rows.Close()
		return scanEntries(rows, pageSize)
	}

	// INDEXED PATH: For filtered queries or non-timestamp sorts, use a cached
	// ordered id list. First request builds the cache (one table scan), then all
	// subsequent pages fetch by primary key IN (...) — O(pageSize).
	cacheKey := fmt.Sprintf("%s|%s|%s|%v", where, sortCol, dir, args)

	ds.pageIndexMu.RLock()
	ids, cached := ds.pageIndex[cacheKey]
	ds.pageIndexMu.RUnlock()

	if !cached {
		// Build the ordered id list for this filter+sort combination
		indexQuery := "SELECT id FROM entries"
		if where != "" {
			indexQuery += " WHERE " + where
		}
		indexQuery += fmt.Sprintf(" ORDER BY %s %s, id %s", sortCol, dir, dir)

		rows, err := ds.db.QueryContext(ctx, indexQuery, args...)
		if err != nil {
			return nil, fmt.Errorf("index build query failed: %w", err)
		}

		ids = make([]int32, 0, 1024)
		for rows.Next() {
			var id int32
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, fmt.Errorf("index scan failed: %w", err)
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("index iteration failed: %w", err)
		}

		// Cache it (limit to 8 entries to bound memory)
		ds.pageIndexMu.Lock()
		if len(ds.pageIndex) >= 8 {
			// Evict all — simple reset
			ds.pageIndex = make(map[string][]int32)
		}
		ds.pageIndex[cacheKey] = ids
		ds.pageIndexMu.Unlock()

		fmt.Printf("[DuckStore] Built page index: %d matching ids for filter (cache key len=%d)\n", len(ids), len(cacheKey))
	}

	// Slice the page from the cached id list
	if offset >= len(ids) {
		return []models.LogEntry{}, nil
	}
	end := offset + pageSize
	if end > len(ids) {
		end = len(ids)
	}
	pageIDs := ids[offset:end]

	if len(pageIDs) == 0 {
		return []models.LogEntry{}, nil
	}

	// Fetch rows by primary key — O(pageSize)
	placeholders := make([]string, len(pageIDs))
	fetchArgs := make([]interface{}, len(pageIDs))
	for i, id := range pageIDs {
		placeholders[i] = fmt.Sprintf("%d", id)
		fetchArgs[i] = id
	}

	query := fmt.Sprintf(`
		SELECT id, timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM entries
		WHERE id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := ds.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("page fetch query failed: %w", err)
	}
	defer rows.Close()

	// Scan into a map keyed by id for reordering
	entryMap := make(map[int32]models.LogEntry, len(pageIDs))
	for rows.Next() {
		var id int32
		entry, err := scanEntryRowsWithID(rows, &id)
		if err != nil {
			return nil, err
		}
		entryMap[id] = entry
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("page scan failed: %w", err)
	}

	// Reorder to match the cached sort order
	entries := make([]models.LogEntry, 0, len(pageIDs))
	for _, id := range pageIDs {
		if entry, ok := entryMap[id]; ok {
			entries = append(entries, entry)
		}
	}

	return entries, nil
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

// ClearCountCache clears the count and page index caches (call when data changes)
func (ds *DuckStore) ClearCountCache() {
	ds.countCacheMu.Lock()
	ds.countCache = make(map[string]int)
	ds.countCacheMu.Unlock()

	ds.pageIndexMu.Lock()
	ds.pageIndex = make(map[string][]int32)
	ds.pageIndexMu.Unlock()
}

// GetCategories returns all unique categories in the store
func (ds *DuckStore) GetCategories(ctx context.Context) ([]string, error) {
	rows, err := ds.db.QueryContext(ctx, "SELECT DISTINCT category FROM entries WHERE category IS NOT NULL AND category != '' ORDER BY category")
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
		if params.SearchRegex {
			// Regex search using DuckDB regexp_matches
			clauses = append(clauses, "(regexp_matches(device_id, ?) OR regexp_matches(signal, ?) OR regexp_matches(COALESCE(val_str, ''), ?) OR regexp_matches(CAST(val_int AS VARCHAR), ?) OR regexp_matches(CAST(val_float AS VARCHAR), ?) OR regexp_matches(CAST(val_bool AS VARCHAR), ?))")
			args = append(args, params.Search, params.Search, params.Search, params.Search, params.Search, params.Search)
		} else {
			// Substring search on signal/device/value (all value columns)
			searchPattern := "%" + params.Search + "%"
			op := "ILIKE"
			if params.SearchCaseSensitive {
				op = "LIKE"
			}
			clause := fmt.Sprintf("(device_id %s ? OR signal %s ? OR val_str %s ? OR CAST(val_int AS VARCHAR) %s ? OR CAST(val_float AS VARCHAR) %s ? OR CAST(val_bool AS VARCHAR) %s ?)",
				op, op, op, op, op, op)
			clauses = append(clauses, clause)
			args = append(args, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
		}
	}

	if len(params.Categories) == 1 {
		clauses = append(clauses, "category = ?")
		args = append(args, params.Categories[0])
	} else if len(params.Categories) > 1 {
		placeholders := make([]string, len(params.Categories))
		for i, cat := range params.Categories {
			placeholders[i] = "?"
			args = append(args, cat)
		}
		clauses = append(clauses, "category IN ("+strings.Join(placeholders, ", ")+")")
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

	// Signal name filter (format: "deviceId::signalName")
	if len(params.Signals) > 0 {
		var signalClauses []string
		for _, s := range params.Signals {
			parts := strings.Split(s, "::")
			if len(parts) == 2 {
				signalClauses = append(signalClauses, "(device_id = ? AND signal = ?)")
				args = append(args, parts[0], parts[1])
			}
		}
		if len(signalClauses) > 0 {
			clauses = append(clauses, "("+strings.Join(signalClauses, " OR ")+")")
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
func (ds *DuckStore) GetEntries(ctx context.Context, start, end int) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	count := end - start
	if count <= 0 {
		return []models.LogEntry{}, nil
	}

	rows, err := ds.db.QueryContext(ctx, `
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
func (ds *DuckStore) GetChunk(ctx context.Context, startTs, endTs time.Time, signals []string) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

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
func (ds *DuckStore) GetValuesAtTime(ctx context.Context, ts time.Time, signals []string) ([]models.LogEntry, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

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

// BoundaryValues holds the last value before and first value after a time window for each signal
type BoundaryValues struct {
	Before map[string]models.LogEntry // signal key -> last entry before startTs
	After  map[string]models.LogEntry // signal key -> first entry after endTs
}

// GetBoundaryValues returns the last value before startTs and first value after endTs for each signal.
// This is used by waveform rendering to properly draw signal state continuation.
func (ds *DuckStore) GetBoundaryValues(ctx context.Context, startTs, endTs time.Time, signals []string) (*BoundaryValues, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	startMs := startTs.UnixMilli()
	endMs := endTs.UnixMilli()

	result := &BoundaryValues{
		Before: make(map[string]models.LogEntry),
		After:  make(map[string]models.LogEntry),
	}

	if len(signals) == 0 {
		return result, nil
	}

	// Build signal filter clause
	var signalClauses []string
	var args []interface{}
	for _, s := range signals {
		parts := strings.Split(s, "::")
		if len(parts) == 2 {
			signalClauses = append(signalClauses, "(device_id = ? AND signal = ?)")
			args = append(args, parts[0], parts[1])
		}
	}

	if len(signalClauses) == 0 {
		return result, nil
	}

	signalFilter := "(" + strings.Join(signalClauses, " OR ") + ")"

	// Query for "before" values - last entry before startTs for each signal
	beforeQuery := `
		WITH ranked AS (
			SELECT 
				timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str,
				ROW_NUMBER() OVER(PARTITION BY device_id, signal ORDER BY timestamp DESC) as rn
			FROM entries
			WHERE timestamp < ? AND ` + signalFilter + `
		)
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM ranked WHERE rn = 1
	`
	beforeArgs := append([]interface{}{startMs}, args...)

	rows, err := ds.db.QueryContext(ctx, beforeQuery, beforeArgs...)
	if err != nil {
		return nil, fmt.Errorf("before query failed: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		entry, err := scanEntryRows(rows)
		if err != nil {
			return nil, err
		}
		key := entry.DeviceID + "::" + entry.SignalName
		result.Before[key] = entry
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Query for "after" values - first entry after endTs for each signal
	afterQuery := `
		WITH ranked AS (
			SELECT 
				timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str,
				ROW_NUMBER() OVER(PARTITION BY device_id, signal ORDER BY timestamp ASC) as rn
			FROM entries
			WHERE timestamp > ? AND ` + signalFilter + `
		)
		SELECT timestamp, device_id, signal, category, val_type, val_bool, val_int, val_float, val_str
		FROM ranked WHERE rn = 1
	`
	afterArgs := append([]interface{}{endMs}, args...)

	rows2, err := ds.db.QueryContext(ctx, afterQuery, afterArgs...)
	if err != nil {
		return nil, fmt.Errorf("after query failed: %w", err)
	}
	defer rows2.Close()

	for rows2.Next() {
		entry, err := scanEntryRows(rows2)
		if err != nil {
			return nil, err
		}
		key := entry.DeviceID + "::" + entry.SignalName
		result.After[key] = entry
	}

	return result, rows2.Err()
}

// GetSignalTypes returns a map of signal key (deviceId::signal) to SignalType.
// Uses DISTINCT query to get one type per signal efficiently.
func (ds *DuckStore) GetSignalTypes() (map[string]models.SignalType, error) {
	rows, err := ds.db.Query("SELECT DISTINCT device_id || '::' || signal AS key, val_type FROM entries")
	if err != nil {
		return nil, fmt.Errorf("signal types query failed: %w", err)
	}
	defer rows.Close()

	result := make(map[string]models.SignalType)
	for rows.Next() {
		var key string
		var valType int
		if err := rows.Scan(&key, &valType); err != nil {
			return nil, err
		}
		result[key] = valTypeToSignalType(valType)
	}
	return result, rows.Err()
}

// GetSignals returns all unique signal keys
// GetIndexByTime returns the 0-based index of the first record matching filters where timestamp >= ts.
func (ds *DuckStore) GetIndexByTime(ctx context.Context, params QueryParams, ts int64) (int, error) {
	// Acquire semaphore to limit concurrent queries
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return 0, ctx.Err()
	}

	where, args := ds.buildWhereClause(params)

	sortCol := "timestamp"
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

	// Inner query to rank all filtered rows
	// Outer query to find the first one that satisfies the timestamp condition
	// We use id as a tie-breaker for stable ordering
	whereClause := ""
	if where != "" {
		whereClause = "WHERE " + where
	}

	query := fmt.Sprintf(`
		WITH ranked AS (
			SELECT timestamp, ROW_NUMBER() OVER (ORDER BY %s %s, id %s) - 1 as row_idx
			FROM entries
			%s
		)
		SELECT row_idx FROM ranked
		WHERE timestamp >= ?
		ORDER BY row_idx ASC
		LIMIT 1
	`, sortCol, dir, dir, whereClause)

	queryArgs := append(args, ts)

	var index int
	err := ds.db.QueryRowContext(ctx, query, queryArgs...).Scan(&index)
	if err == sql.ErrNoRows {
		// If no record found with ts >= target, it means we're past the end
		// Return -1 to indicate not found
		return -1, nil
	}
	if err != nil {
		return 0, fmt.Errorf("index query failed: %w", err)
	}

	return index, nil
}

// TimeTreeEntry represents a distinct date/hour/minute combination with its earliest timestamp.
type TimeTreeEntry struct {
	Date   string `json:"date"`
	Hour   int    `json:"hour"`
	Minute int    `json:"minute"`
	Ts     int64  `json:"ts"`
}

// GetTimeTree returns all distinct date/hour/minute combinations from the full dataset (respecting filters).
func (ds *DuckStore) GetTimeTree(ctx context.Context, params QueryParams) ([]TimeTreeEntry, error) {
	select {
	case ds.querySem <- struct{}{}:
		defer func() { <-ds.querySem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	where, args := ds.buildWhereClause(params)
	whereClause := ""
	if where != "" {
		whereClause = "WHERE " + where
	}

	query := fmt.Sprintf(`
		SELECT
			strftime(to_timestamp(timestamp / 1000)::TIMESTAMP, '%%Y-%%m-%%d') AS date,
			EXTRACT(HOUR FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS hour,
			EXTRACT(MINUTE FROM to_timestamp(timestamp / 1000)::TIMESTAMP) AS minute,
			MIN(timestamp) AS ts
		FROM entries
		%s
		GROUP BY date, hour, minute
		ORDER BY date, hour, minute
	`, whereClause)

	rows, err := ds.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("time tree query failed: %w", err)
	}
	defer rows.Close()

	var result []TimeTreeEntry
	for rows.Next() {
		var e TimeTreeEntry
		if err := rows.Scan(&e.Date, &e.Hour, &e.Minute, &e.Ts); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

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

// SetPersistent marks this store so Close() won't delete the database file.
func (ds *DuckStore) SetPersistent(p bool) {
	ds.persistent = p
}

// Close closes the database connection.
// If the store is not persistent, it also removes the database file.
func (ds *DuckStore) Close() error {
	if ds.db != nil {
		ds.db.Close()
	}
	if ds.dbPath != "" && !ds.persistent {
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

// scanEntryRowsWithID scans a row that includes the id column as the first field.
func scanEntryRowsWithID(rows *sql.Rows, id *int32) (models.LogEntry, error) {
	var tsMs int64
	var deviceID, signal, category string
	var valType int
	var valBool sql.NullBool
	var valInt sql.NullInt64
	var valFloat sql.NullFloat64
	var valStr sql.NullString

	err := rows.Scan(id, &tsMs, &deviceID, &signal, &category, &valType, &valBool, &valInt, &valFloat, &valStr)
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
