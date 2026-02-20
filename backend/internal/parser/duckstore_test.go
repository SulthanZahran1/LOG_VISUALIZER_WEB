// duckstore_test.go - Tests for DuckDB-backed log entry storage
package parser

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// createTestStore creates a temporary DuckStore for testing
func createTestStore(t *testing.T) (*DuckStore, func()) {
	tempDir := t.TempDir()
	sessionID := "test_" + time.Now().Format("20060102_150405")
	
	store, err := NewDuckStore(tempDir, sessionID)
	if err != nil {
		t.Fatalf("Failed to create DuckStore: %v", err)
	}
	
	cleanup := func() {
		store.Close()
	}
	
	return store, cleanup
}

// createTestEntry creates a LogEntry for testing
func createTestEntry(device, signal string, ts time.Time, value interface{}, category string) *models.LogEntry {
	return &models.LogEntry{
		DeviceID:   device,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		Category:   category,
	}
}

func TestNewDuckStore(t *testing.T) {
	t.Run("creates store successfully", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		if store == nil {
			t.Error("Expected store to be created, got nil")
		}
		if store.db == nil {
			t.Error("Expected database connection to be initialized")
		}
		if store.batchSize != 50000 {
			t.Errorf("Expected batch size 50000, got %d", store.batchSize)
		}
	})
	
	t.Run("creates database file", func(t *testing.T) {
		tempDir := t.TempDir()
		sessionID := "file_test"
		
		store, err := NewDuckStore(tempDir, sessionID)
		if err != nil {
			t.Fatalf("Failed to create store: %v", err)
		}
		defer store.Close()
		
		// Check that the database file was created
		dbPath := filepath.Join(tempDir, "session_"+sessionID+".duckdb")
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			t.Error("Expected database file to be created")
		}
	})
}

func TestDuckStore_AddEntry(t *testing.T) {
	t.Run("adds single entry", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		entry := createTestEntry("PLC-01", "Signal1", time.Now(), true, "CATEGORY")
		store.AddEntry(entry)
		
		if store.entryCount != 1 {
			t.Errorf("Expected entry count 1, got %d", store.entryCount)
		}
	})
	
	t.Run("tracks signals", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		store.AddEntry(createTestEntry("PLC-01", "Signal1", time.Now(), true, ""))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", time.Now(), false, ""))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", time.Now(), true, ""))
		
		signals := store.GetSignals()
		if len(signals) != 3 {
			t.Errorf("Expected 3 unique signals, got %d", len(signals))
		}
		
		// Check specific signals exist
		expectedSignals := []string{"PLC-01::Signal1", "PLC-01::Signal2", "PLC-02::Signal1"}
		for _, sig := range expectedSignals {
			if _, ok := signals[sig]; !ok {
				t.Errorf("Expected signal %s to be tracked", sig)
			}
		}
	})
	
	t.Run("tracks devices", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		store.AddEntry(createTestEntry("PLC-01", "Signal1", time.Now(), true, ""))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", time.Now(), false, ""))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", time.Now(), true, ""))
		
		devices := store.GetDevices()
		if len(devices) != 2 {
			t.Errorf("Expected 2 unique devices, got %d", len(devices))
		}
		
		if _, ok := devices["PLC-01"]; !ok {
			t.Error("Expected device PLC-01 to be tracked")
		}
		if _, ok := devices["PLC-02"]; !ok {
			t.Error("Expected device PLC-02 to be tracked")
		}
	})
	
	t.Run("tracks time range", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		ts1 := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		ts2 := time.Date(2024, 1, 15, 11, 0, 0, 0, time.UTC)
		ts3 := time.Date(2024, 1, 15, 9, 0, 0, 0, time.UTC)
		
		store.AddEntry(createTestEntry("PLC-01", "Signal1", ts1, true, ""))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", ts2, false, ""))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", ts3, true, ""))
		
		timeRange := store.GetTimeRange()
		if timeRange == nil {
			t.Fatal("Expected time range to be set")
		}
		
		if !timeRange.Start.Equal(ts3) {
			t.Errorf("Expected start time %v, got %v", ts3, timeRange.Start)
		}
		if !timeRange.End.Equal(ts2) {
			t.Errorf("Expected end time %v, got %v", ts2, timeRange.End)
		}
	})
	
	t.Run("handles different value types", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		now := time.Now()
		store.AddEntry(createTestEntry("PLC-01", "BoolSignal", now, true, ""))
		store.AddEntry(createTestEntry("PLC-01", "IntSignal", now, 42, ""))
		store.AddEntry(createTestEntry("PLC-01", "FloatSignal", now, 3.14, ""))
		store.AddEntry(createTestEntry("PLC-01", "StringSignal", now, "test value", ""))
		store.AddEntry(createTestEntry("PLC-01", "Int64Signal", now, int64(9999999999), ""))
		
		if store.entryCount != 5 {
			t.Errorf("Expected entry count 5, got %d", store.entryCount)
		}
	})
}

func TestDuckStore_FlushAndQuery(t *testing.T) {
	t.Run("flushes batch and queries entries", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Add entries
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 10; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			entry := createTestEntry("PLC-01", "Signal1", ts, i%2 == 0, "TEST")
			store.AddEntry(entry)
		}
		
		// Finalize to flush remaining entries
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		// Query entries
		ctx := context.Background()
		params := QueryParams{}
		entries, total, err := store.QueryEntries(ctx, params, 1, 5)
		if err != nil {
			t.Fatalf("Failed to query entries: %v", err)
		}
		
		if total != 10 {
			t.Errorf("Expected total 10, got %d", total)
		}
		if len(entries) != 5 {
			t.Errorf("Expected 5 entries, got %d", len(entries))
		}
	})
	
	t.Run("queries with search filter", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "MotorRunning", baseTime, true, ""))
		store.AddEntry(createTestEntry("PLC-01", "SensorActive", baseTime.Add(time.Second), false, ""))
		store.AddEntry(createTestEntry("PLC-02", "MotorRunning", baseTime.Add(2*time.Second), true, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{Search: "Motor", SearchCaseSensitive: false}
		entries, total, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		if total != 2 {
			t.Errorf("Expected 2 matching entries, got %d", total)
		}
		if len(entries) != 2 {
			t.Errorf("Expected 2 entries returned, got %d", len(entries))
		}
	})
	
	t.Run("queries with category filter", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, true, "CATEGORY_A"))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", baseTime.Add(time.Second), false, "CATEGORY_B"))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", baseTime.Add(2*time.Second), true, "CATEGORY_A"))
		store.AddEntry(createTestEntry("PLC-02", "Signal2", baseTime.Add(3*time.Second), false, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{Categories: []string{"CATEGORY_A"}}
		entries, total, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		if total != 2 {
			t.Errorf("Expected 2 entries in CATEGORY_A, got %d", total)
		}
		
		for _, entry := range entries {
			if entry.Category != "CATEGORY_A" {
				t.Errorf("Expected category CATEGORY_A, got %s", entry.Category)
			}
		}
	})
	
	t.Run("queries with signal filter", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, true, ""))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", baseTime.Add(time.Second), false, ""))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", baseTime.Add(2*time.Second), true, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{Signals: []string{"PLC-01::Signal1"}}
		entries, total, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		if total != 1 {
			t.Errorf("Expected 1 matching entry, got %d", total)
		}
		if len(entries) != 1 || entries[0].DeviceID != "PLC-01" || entries[0].SignalName != "Signal1" {
			t.Error("Expected specific signal entry")
		}
	})
	
	t.Run("queries with sorting", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "SignalA", baseTime, true, ""))
		store.AddEntry(createTestEntry("PLC-02", "SignalB", baseTime.Add(time.Second), false, ""))
		store.AddEntry(createTestEntry("PLC-03", "SignalC", baseTime.Add(2*time.Second), true, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		
		// Test descending sort
		params := QueryParams{SortColumn: "timestamp", SortDirection: "desc"}
		entries, _, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		if len(entries) != 3 {
			t.Fatalf("Expected 3 entries, got %d", len(entries))
		}
		
		// Should be in reverse order
		if !entries[0].Timestamp.After(entries[1].Timestamp) {
			t.Error("Expected descending order")
		}
	})
}

func TestDuckStore_GetChunk(t *testing.T) {
	t.Run("returns entries in time range", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 20; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		startTs := baseTime.Add(5 * time.Second)
		endTs := baseTime.Add(10 * time.Second)
		
		entries, err := store.GetChunk(ctx, startTs, endTs, nil)
		if err != nil {
			t.Fatalf("Failed to get chunk: %v", err)
		}
		
		// Should get entries with ts >= start and <= end (inclusive)
		expectedCount := 6 // 5, 6, 7, 8, 9, 10
		if len(entries) != expectedCount {
			t.Errorf("Expected %d entries, got %d", expectedCount, len(entries))
		}
		
		// Verify timestamps
		for _, entry := range entries {
			if entry.Timestamp.Before(startTs) || entry.Timestamp.After(endTs) {
				t.Errorf("Entry timestamp %v outside range [%v, %v]", entry.Timestamp, startTs, endTs)
			}
		}
	})
	
	t.Run("filters by signals", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 10; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
			store.AddEntry(createTestEntry("PLC-01", "Signal2", ts, i*10, ""))
			store.AddEntry(createTestEntry("PLC-02", "Signal1", ts, i*100, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		signals := []string{"PLC-01::Signal1"}
		
		entries, err := store.GetChunk(ctx, baseTime, baseTime.Add(9*time.Second), signals)
		if err != nil {
			t.Fatalf("Failed to get chunk: %v", err)
		}
		
		// Should only get Signal1 entries
		if len(entries) != 10 {
			t.Errorf("Expected 10 entries, got %d", len(entries))
		}
		
		for _, entry := range entries {
			if entry.SignalName != "Signal1" || entry.DeviceID != "PLC-01" {
				t.Errorf("Expected only PLC-01::Signal1, got %s::%s", entry.DeviceID, entry.SignalName)
			}
		}
	})
}

func TestDuckStore_GetValuesAtTime(t *testing.T) {
	t.Run("returns latest values at timestamp", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		
		// Add entries at different times
		store.AddEntry(createTestEntry("PLC-01", "MotorRunning", baseTime, false, ""))
		store.AddEntry(createTestEntry("PLC-01", "MotorRunning", baseTime.Add(5*time.Second), true, ""))
		store.AddEntry(createTestEntry("PLC-01", "MotorRunning", baseTime.Add(10*time.Second), false, ""))
		
		store.AddEntry(createTestEntry("PLC-01", "SensorValue", baseTime, 100, ""))
		store.AddEntry(createTestEntry("PLC-01", "SensorValue", baseTime.Add(7*time.Second), 200, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		queryTime := baseTime.Add(6 * time.Second)
		
		entries, err := store.GetValuesAtTime(ctx, queryTime, nil)
		if err != nil {
			t.Fatalf("Failed to get values: %v", err)
		}
		
		// Should get MotorRunning=true (from t=5s) and SensorValue=100 (from t=0s)
		if len(entries) != 2 {
			t.Errorf("Expected 2 entries, got %d", len(entries))
		}
		
		for _, entry := range entries {
			switch entry.SignalName {
			case "MotorRunning":
				if entry.Value != true {
					t.Errorf("Expected MotorRunning=true, got %v", entry.Value)
				}
			case "SensorValue":
				if entry.Value != 100 {
					t.Errorf("Expected SensorValue=100, got %v", entry.Value)
				}
			}
		}
	})
}

func TestDuckStore_GetBoundaryValues(t *testing.T) {
	t.Run("returns boundary values for time window", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		
		// Before window
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime.Add(-5*time.Second), "before", ""))
		
		// Inside window
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime.Add(5*time.Second), "inside", ""))
		
		// After window
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime.Add(15*time.Second), "after", ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		startTs := baseTime
		endTs := baseTime.Add(10 * time.Second)
		signals := []string{"PLC-01::Signal1"}
		
		boundaries, err := store.GetBoundaryValues(ctx, startTs, endTs, signals)
		if err != nil {
			t.Fatalf("Failed to get boundaries: %v", err)
		}
		
		if len(boundaries.Before) != 1 {
			t.Errorf("Expected 1 before value, got %d", len(boundaries.Before))
		}
		if len(boundaries.After) != 1 {
			t.Errorf("Expected 1 after value, got %d", len(boundaries.After))
		}
		
		if before, ok := boundaries.Before["PLC-01::Signal1"]; ok {
			if before.Value != "before" {
				t.Errorf("Expected before value 'before', got %v", before.Value)
			}
		} else {
			t.Error("Expected before value for PLC-01::Signal1")
		}
		
		if after, ok := boundaries.After["PLC-01::Signal1"]; ok {
			if after.Value != "after" {
				t.Errorf("Expected after value 'after', got %v", after.Value)
			}
		} else {
			t.Error("Expected after value for PLC-01::Signal1")
		}
	})
}

func TestDuckStore_GetCategories(t *testing.T) {
	t.Run("returns unique categories", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, true, "CATEGORY_A"))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", baseTime.Add(time.Second), false, "CATEGORY_B"))
		store.AddEntry(createTestEntry("PLC-02", "Signal1", baseTime.Add(2*time.Second), true, "CATEGORY_A"))
		store.AddEntry(createTestEntry("PLC-02", "Signal2", baseTime.Add(3*time.Second), false, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		categories, err := store.GetCategories(ctx)
		if err != nil {
			t.Fatalf("Failed to get categories: %v", err)
		}
		
		if len(categories) != 2 {
			t.Errorf("Expected 2 categories, got %d", len(categories))
		}
		
		// Categories should be sorted
		if categories[0] != "CATEGORY_A" || categories[1] != "CATEGORY_B" {
			t.Errorf("Expected sorted categories [CATEGORY_A, CATEGORY_B], got %v", categories)
		}
	})
}

func TestDuckStore_GetSignalTypes(t *testing.T) {
	t.Run("returns signal types", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "BoolSignal", baseTime, true, ""))
		store.AddEntry(createTestEntry("PLC-01", "IntSignal", baseTime.Add(time.Second), 42, ""))
		store.AddEntry(createTestEntry("PLC-02", "BoolSignal", baseTime.Add(2*time.Second), false, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		signalTypes, err := store.GetSignalTypes()
		if err != nil {
			t.Fatalf("Failed to get signal types: %v", err)
		}
		
		if len(signalTypes) != 3 {
			t.Errorf("Expected 3 signal types, got %d", len(signalTypes))
		}
		
		if sigType, ok := signalTypes["PLC-01::BoolSignal"]; !ok || sigType != models.SignalTypeBoolean {
			t.Errorf("Expected PLC-01::BoolSignal to be boolean, got %v", sigType)
		}
		
		if sigType, ok := signalTypes["PLC-01::IntSignal"]; !ok || sigType != models.SignalTypeInteger {
			t.Errorf("Expected PLC-01::IntSignal to be integer, got %v", sigType)
		}
	})
}

func TestDuckStore_GetEntry(t *testing.T) {
	t.Run("returns entry by index", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, "first", ""))
		store.AddEntry(createTestEntry("PLC-01", "Signal2", baseTime.Add(time.Second), "second", ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		entry, err := store.GetEntry(0)
		if err != nil {
			t.Fatalf("Failed to get entry: %v", err)
		}
		
		if entry.Value != "first" {
			t.Errorf("Expected value 'first', got %v", entry.Value)
		}
		
		entry, err = store.GetEntry(1)
		if err != nil {
			t.Fatalf("Failed to get entry: %v", err)
		}
		
		if entry.Value != "second" {
			t.Errorf("Expected value 'second', got %v", entry.Value)
		}
	})
}

func TestDuckStore_GetIndexByTime(t *testing.T) {
	t.Run("returns index by timestamp", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 10; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{}
		
		// Get index for 5th second
		index, err := store.GetIndexByTime(ctx, params, baseTime.Add(5*time.Second).UnixMilli())
		if err != nil {
			t.Fatalf("Failed to get index: %v", err)
		}
		
		if index != 5 {
			t.Errorf("Expected index 5, got %d", index)
		}
	})
	
	t.Run("returns -1 for timestamp beyond range", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 5; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{}
		
		// Get index for time beyond last entry
		index, err := store.GetIndexByTime(ctx, params, baseTime.Add(10*time.Second).UnixMilli())
		if err != nil {
			t.Fatalf("Failed to get index: %v", err)
		}
		
		if index != -1 {
			t.Errorf("Expected index -1 (not found), got %d", index)
		}
	})
}

func TestDuckStore_GetTimeTree(t *testing.T) {
	t.Run("returns time tree", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		
		// Add entries across different minutes
		for i := 0; i < 5; i++ {
			ts := baseTime.Add(time.Duration(i*30) * time.Second) // 0s, 30s, 60s, 90s, 120s
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{}
		
		tree, err := store.GetTimeTree(ctx, params)
		if err != nil {
			t.Fatalf("Failed to get time tree: %v", err)
		}
		
		// Should have entries for minute 0 and minute 2
		if len(tree) < 2 {
			t.Errorf("Expected at least 2 time tree entries, got %d", len(tree))
		}
		
		// All entries should be for the same date
		for _, entry := range tree {
			if entry.Date != "2024-01-15" {
				t.Errorf("Expected date 2024-01-15, got %s", entry.Date)
			}
		}
	})
}

func TestDuckStore_Cache(t *testing.T) {
	t.Run("caches count queries", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 100; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, "TEST"))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{Categories: []string{"TEST"}}
		
		// First query should cache
		_, total1, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		// Second query should use cache
		_, total2, err := store.QueryEntries(ctx, params, 2, 10)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		
		if total1 != total2 {
			t.Errorf("Expected same total from cache, got %d and %d", total1, total2)
		}
		
		if total1 != 100 {
			t.Errorf("Expected total 100, got %d", total1)
		}
	})
	
	t.Run("clears cache", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, true, ""))
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		// Populate cache
		ctx := context.Background()
		store.QueryEntries(ctx, QueryParams{}, 1, 10)
		
		// Clear cache
		store.ClearCountCache()
		
		if len(store.countCache) != 0 {
			t.Error("Expected count cache to be cleared")
		}
		if len(store.pageIndex) != 0 {
			t.Error("Expected page index to be cleared")
		}
	})
}

func TestDuckStore_Len(t *testing.T) {
	t.Run("returns entry count", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		if store.Len() != 0 {
			t.Errorf("Expected initial length 0, got %d", store.Len())
		}
		
		for i := 0; i < 50; i++ {
			store.AddEntry(createTestEntry("PLC-01", "Signal1", time.Now(), i, ""))
		}
		
		if store.Len() != 50 {
			t.Errorf("Expected length 50, got %d", store.Len())
		}
	})
}

func TestDuckStore_LastError(t *testing.T) {
	t.Run("returns last error", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Initially no error
		if store.LastError() != nil {
			t.Error("Expected no initial error")
		}
	})
}

func TestDuckStore_Persistent(t *testing.T) {
	t.Run("marks store as persistent", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		store.AddEntry(createTestEntry("PLC-01", "Signal1", time.Now(), true, ""))
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		// Mark as persistent
		store.SetPersistent(true)
		
		// Get the db path before closing
		dbPath := store.dbPath
		
		// Close should not delete the file
		store.Close()
		
		// Verify file still exists
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			t.Error("Expected database file to persist")
		}
		
		// Clean up manually
		os.Remove(dbPath)
	})
}

func TestDuckStore_OpenReadOnly(t *testing.T) {
	t.Run("opens existing database read-only", func(t *testing.T) {
		tempDir := t.TempDir()
		dbPath := filepath.Join(tempDir, "test_persistent.duckdb")
		
		// Create and populate a store
		store1, err := NewDuckStoreAtPath(dbPath)
		if err != nil {
			t.Fatalf("Failed to create store: %v", err)
		}
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		store1.AddEntry(createTestEntry("PLC-01", "Signal1", baseTime, true, ""))
		store1.AddEntry(createTestEntry("PLC-02", "Signal2", baseTime.Add(time.Second), 42, ""))
		
		err = store1.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		// Mark as persistent so Close() won't delete the file
		store1.SetPersistent(true)
		store1.Close()
		
		// Verify file exists
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			t.Fatal("Database file should exist after closing persistent store")
		}
		
		// Re-open as read-only
		store2, err := OpenDuckStoreReadOnly(dbPath)
		if err != nil {
			t.Fatalf("Failed to open read-only: %v", err)
		}
		defer store2.Close()
		
		if store2.Len() != 2 {
			t.Errorf("Expected 2 entries, got %d", store2.Len())
		}
		
		signals := store2.GetSignals()
		if len(signals) != 2 {
			t.Errorf("Expected 2 signals, got %d", len(signals))
		}
		
		timeRange := store2.GetTimeRange()
		if timeRange == nil {
			t.Error("Expected time range to be loaded")
		}
	})
}

func TestDuckStore_Pagination(t *testing.T) {
	t.Run("paginates correctly", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
		for i := 0; i < 100; i++ {
			ts := baseTime.Add(time.Duration(i) * time.Second)
			store.AddEntry(createTestEntry("PLC-01", "Signal1", ts, i, ""))
		}
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize: %v", err)
		}
		
		ctx := context.Background()
		params := QueryParams{}
		
		// Get first page
		page1, total, err := store.QueryEntries(ctx, params, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query page 1: %v", err)
		}
		
		if total != 100 {
			t.Errorf("Expected total 100, got %d", total)
		}
		if len(page1) != 10 {
			t.Errorf("Expected 10 entries on page 1, got %d", len(page1))
		}
		
		// Check first entry value
		if page1[0].Value != 0 {
			t.Errorf("Expected first entry value 0, got %v", page1[0].Value)
		}
		
		// Get second page
		page2, _, err := store.QueryEntries(ctx, params, 2, 10)
		if err != nil {
			t.Fatalf("Failed to query page 2: %v", err)
		}
		
		if len(page2) != 10 {
			t.Errorf("Expected 10 entries on page 2, got %d", len(page2))
		}
		
		// Check first entry of page 2
		if page2[0].Value != 10 {
			t.Errorf("Expected page 2 first value 10, got %v", page2[0].Value)
		}
		
		// Get last page
		page10, _, err := store.QueryEntries(ctx, params, 10, 10)
		if err != nil {
			t.Fatalf("Failed to query page 10: %v", err)
		}
		
		if len(page10) != 10 {
			t.Errorf("Expected 10 entries on page 10, got %d", len(page10))
		}
		
		// Check last entry
		if page10[9].Value != 99 {
			t.Errorf("Expected last value 99, got %v", page10[9].Value)
		}
	})
}

func TestDuckStore_EmptyStore(t *testing.T) {
	t.Run("handles empty store gracefully", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		err := store.Finalize()
		if err != nil {
			t.Fatalf("Failed to finalize empty store: %v", err)
		}
		
		ctx := context.Background()
		
		// Query should return empty results
		entries, total, err := store.QueryEntries(ctx, QueryParams{}, 1, 10)
		if err != nil {
			t.Fatalf("Failed to query empty store: %v", err)
		}
		
		if total != 0 {
			t.Errorf("Expected total 0, got %d", total)
		}
		if len(entries) != 0 {
			t.Errorf("Expected 0 entries, got %d", len(entries))
		}
		
		// Time range should be nil
		timeRange := store.GetTimeRange()
		if timeRange != nil {
			t.Error("Expected nil time range for empty store")
		}
		
		// Categories should be empty
		categories, err := store.GetCategories(ctx)
		if err != nil {
			t.Fatalf("Failed to get categories: %v", err)
		}
		if len(categories) != 0 {
			t.Errorf("Expected 0 categories, got %d", len(categories))
		}
	})
}

func BenchmarkDuckStore_AddEntry(b *testing.B) {
	store, cleanup := createTestStore(&testing.T{})
	defer cleanup()
	
	baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ts := baseTime.Add(time.Duration(i) * time.Millisecond)
		entry := createTestEntry("PLC-01", "Signal1", ts, i, "BENCH")
		store.AddEntry(entry)
	}
}

func BenchmarkDuckStore_QueryEntries(b *testing.B) {
	store, cleanup := createTestStore(&testing.T{})
	defer cleanup()
	
	baseTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	
	// Populate with 10000 entries
	for i := 0; i < 10000; i++ {
		ts := baseTime.Add(time.Duration(i) * time.Millisecond)
		entry := createTestEntry("PLC-01", "Signal1", ts, i, "BENCH")
		store.AddEntry(entry)
	}
	
	store.Finalize()
	
	ctx := context.Background()
	params := QueryParams{}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		page := (i % 100) + 1
		store.QueryEntries(ctx, params, page, 100)
	}
}
