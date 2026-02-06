package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/plc-visualizer/backend/internal/parser"
)

// shortID safely truncates an ID for logging (handles short IDs gracefully)
func shortID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

// PersistentParsedStore manages persistent DuckDB files for parsed log files.
// Instead of re-parsing every time a file is loaded from "Recent Files",
// we store the parsed data in a persistent DuckDB file keyed by the file ID.
type PersistentParsedStore struct {
	parsedDir string
	mu        sync.RWMutex
	// cache tracks which file IDs have been parsed (fileID -> dbPath)
	cache map[string]string
}

// NewPersistentParsedStore creates a new persistent parsed store.
// Uses environment variable PARSED_DB_DIR for storage location, defaults to ./data/parsed
func NewPersistentParsedStore() *PersistentParsedStore {
	parsedDir := os.Getenv("PARSED_DB_DIR")
	if parsedDir == "" {
		parsedDir = "./data/parsed"
	}
	return NewPersistentParsedStoreWithDir(parsedDir)
}

// NewPersistentParsedStoreWithDir creates a persistent parsed store with a specific directory.
func NewPersistentParsedStoreWithDir(parsedDir string) *PersistentParsedStore {
	// Ensure directory exists
	os.MkdirAll(parsedDir, 0755)

	store := &PersistentParsedStore{
		parsedDir: parsedDir,
		cache:     make(map[string]string),
	}

	// Scan existing parsed databases on startup
	store.scanExisting()

	return store
}

// scanExisting scans the parsed directory for existing databases on startup.
func (pps *PersistentParsedStore) scanExisting() {
	entries, err := os.ReadDir(pps.parsedDir)
	if err != nil {
		fmt.Printf("[ParsedStore] Warning: failed to scan parsed directory: %v\n", err)
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		// Look for files matching pattern: file_<id>.duckdb
		name := entry.Name()
		if len(name) > 7 && name[:5] == "file_" && filepath.Ext(name) == ".duckdb" {
			fileID := name[5 : len(name)-7] // Remove "file_" prefix and ".duckdb" suffix
			dbPath := filepath.Join(pps.parsedDir, name)
			pps.cache[fileID] = dbPath
			fmt.Printf("[ParsedStore] Found existing parsed DB for file %s\n", shortID(fileID))
		}
	}

	fmt.Printf("[ParsedStore] Scanned %d existing parsed databases\n", len(pps.cache))
}

// GetDBPath returns the path where a parsed DB would be stored for a file ID.
func (pps *PersistentParsedStore) GetDBPath(fileID string) string {
	return filepath.Join(pps.parsedDir, fmt.Sprintf("file_%s.duckdb", fileID))
}

// IsParsed checks if a file has already been parsed and stored.
func (pps *PersistentParsedStore) IsParsed(fileID string) bool {
	pps.mu.RLock()
	_, ok := pps.cache[fileID]
	pps.mu.RUnlock()

	if ok {
		return true
	}

	// Double-check by looking for the file (in case it was created externally)
	dbPath := pps.GetDBPath(fileID)
	if _, err := os.Stat(dbPath); err == nil {
		// File exists, add to cache
		pps.mu.Lock()
		pps.cache[fileID] = dbPath
		pps.mu.Unlock()
		return true
	}

	return false
}

// Open opens an existing parsed DuckDB for a file.
// Returns nil if the file hasn't been parsed yet.
func (pps *PersistentParsedStore) Open(fileID string) (*parser.DuckStore, error) {
	if !pps.IsParsed(fileID) {
		return nil, nil
	}

	pps.mu.RLock()
	dbPath := pps.cache[fileID]
	pps.mu.RUnlock()

	// Verify file still exists
	if _, err := os.Stat(dbPath); err != nil {
		// File was deleted, remove from cache
		pps.mu.Lock()
		delete(pps.cache, fileID)
		pps.mu.Unlock()
		return nil, nil
	}

	fmt.Printf("[ParsedStore] Opening existing parsed DB for file %s\n", shortID(fileID))

	// Open the existing database in read-only mode
	store, err := parser.OpenDuckStoreReadOnly(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open parsed DB: %w", err)
	}

	return store, nil
}

// CreateForFile creates a new DuckStore for parsing a file.
// The store will be set up to save to the persistent location.
func (pps *PersistentParsedStore) CreateForFile(fileID string) (*parser.DuckStore, error) {
	dbPath := pps.GetDBPath(fileID)

	// Remove any existing file (in case of re-parse)
	os.Remove(dbPath)

	fmt.Printf("[ParsedStore] Creating new parsed DB for file %s\n", shortID(fileID))

	// Create new DuckStore at the persistent location
	store, err := parser.NewDuckStoreAtPath(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create parsed DB: %w", err)
	}

	return store, nil
}

// MarkComplete marks a file as successfully parsed and ready for reuse.
func (pps *PersistentParsedStore) MarkComplete(fileID string) {
	pps.mu.Lock()
	pps.cache[fileID] = pps.GetDBPath(fileID)
	pps.mu.Unlock()
	fmt.Printf("[ParsedStore] Marked file %s as parsed and ready for reuse\n", shortID(fileID))
}

// Delete removes the parsed DB for a file (call when original file is deleted).
func (pps *PersistentParsedStore) Delete(fileID string) error {
	pps.mu.Lock()
	delete(pps.cache, fileID)
	pps.mu.Unlock()

	dbPath := pps.GetDBPath(fileID)
	if err := os.Remove(dbPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete parsed DB: %w", err)
	}

	fmt.Printf("[ParsedStore] Deleted parsed DB for file %s\n", shortID(fileID))
	return nil
}

// List returns all file IDs that have been parsed.
func (pps *PersistentParsedStore) List() []string {
	pps.mu.RLock()
	defer pps.mu.RUnlock()

	fileIDs := make([]string, 0, len(pps.cache))
	for id := range pps.cache {
		fileIDs = append(fileIDs, id)
	}
	return fileIDs
}

// Stats returns statistics about the parsed store.
func (pps *PersistentParsedStore) Stats() map[string]interface{} {
	pps.mu.RLock()
	defer pps.mu.RUnlock()

	var totalSize int64
	for fileID, dbPath := range pps.cache {
		if info, err := os.Stat(dbPath); err == nil {
			totalSize += info.Size()
		} else {
			// File missing, remove from cache
			delete(pps.cache, fileID)
		}
	}

	return map[string]interface{}{
		"parsedCount": len(pps.cache),
		"totalSize":   totalSize,
		"parsedDir":   pps.parsedDir,
	}
}

// CleanupOrphaned removes parsed DBs that don't have corresponding raw files.
// rawFileIDs should be the list of file IDs that exist in the file storage.
func (pps *PersistentParsedStore) CleanupOrphaned(rawFileIDs []string) int {
	validIDs := make(map[string]bool)
	for _, id := range rawFileIDs {
		validIDs[id] = true
	}

	pps.mu.Lock()
	defer pps.mu.Unlock()

	removed := 0
	for fileID := range pps.cache {
		if !validIDs[fileID] {
			dbPath := pps.cache[fileID]
			os.Remove(dbPath)
			delete(pps.cache, fileID)
			removed++
			fmt.Printf("[ParsedStore] Cleaned up orphaned parsed DB for file %s\n", shortID(fileID))
		}
	}

	return removed
}
