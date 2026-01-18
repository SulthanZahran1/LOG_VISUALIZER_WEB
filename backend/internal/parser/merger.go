package parser

import (
	"sort"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// MergeConfig configures the merge behavior.
type MergeConfig struct {
	// DedupeWindow is the maximum time difference between two entries
	// with the same signal and value to be considered duplicates.
	// Default: 1000ms (1 second).
	DedupeWindow time.Duration
}

// DefaultMergeConfig returns the default merge configuration.
func DefaultMergeConfig() MergeConfig {
	return MergeConfig{
		DedupeWindow: 1000 * time.Millisecond,
	}
}

// MergeLogs merges multiple ParsedLog results into a single ParsedLog.
// It handles:
// 1. Annotating entries with their source file ID
// 2. Merging all entries sorted by timestamp
// 3. Deduplicating entries that have the same signal+value within the dedupe window
func MergeLogs(logs []*models.ParsedLog, sourceIDs []string, config MergeConfig) *models.ParsedLog {
	if len(logs) == 0 {
		return models.NewParsedLog()
	}

	// If only one log, just tag source and return
	if len(logs) == 1 {
		result := logs[0]
		if len(sourceIDs) > 0 {
			for i := range result.Entries {
				result.Entries[i].SourceID = sourceIDs[0]
			}
		}
		return result
	}

	// 1. Collect all entries with source annotations
	totalEntries := 0
	for _, log := range logs {
		totalEntries += len(log.Entries)
	}

	allEntries := make([]models.LogEntry, 0, totalEntries)
	allSignals := make(map[string]struct{})
	allDevices := make(map[string]struct{})

	for i, log := range logs {
		sourceID := ""
		if i < len(sourceIDs) {
			sourceID = sourceIDs[i]
		}

		for _, entry := range log.Entries {
			entry.SourceID = sourceID
			allEntries = append(allEntries, entry)
		}

		for sig := range log.Signals {
			allSignals[sig] = struct{}{}
		}
		for dev := range log.Devices {
			allDevices[dev] = struct{}{}
		}
	}

	// 2. Sort all entries by timestamp
	sort.Slice(allEntries, func(i, j int) bool {
		return allEntries[i].Timestamp.Before(allEntries[j].Timestamp)
	})

	// 3. Deduplicate: remove entries with same signal+value within dedupe window
	deduped := deduplicateEntries(allEntries, config.DedupeWindow)

	// 4. Build result
	result := &models.ParsedLog{
		Entries: deduped,
		Signals: allSignals,
		Devices: allDevices,
	}

	// Calculate time range
	if len(deduped) > 0 {
		result.TimeRange = &models.TimeRange{
			Start: deduped[0].Timestamp,
			End:   deduped[len(deduped)-1].Timestamp,
		}
	}

	return result
}

// deduplicateEntries removes duplicate entries that have the same
// DeviceID+SignalName+Value within the dedupe window.
// Entries are assumed to be sorted by timestamp.
func deduplicateEntries(entries []models.LogEntry, window time.Duration) []models.LogEntry {
	if len(entries) <= 1 || window <= 0 {
		return entries
	}

	result := make([]models.LogEntry, 0, len(entries))
	result = append(result, entries[0])

	for i := 1; i < len(entries); i++ {
		current := entries[i]
		prev := result[len(result)-1]

		// Check if this is a duplicate
		isDuplicate := false

		// Only consider deduplication if within the time window
		if current.Timestamp.Sub(prev.Timestamp) < window {
			// Same device, signal, and value = duplicate
			if current.DeviceID == prev.DeviceID &&
				current.SignalName == prev.SignalName &&
				valuesEqual(current.Value, prev.Value) {
				isDuplicate = true
			}
		}

		if !isDuplicate {
			result = append(result, current)
		}
	}

	return result
}

// valuesEqual compares two interface{} values for equality.
func valuesEqual(a, b interface{}) bool {
	// Handle nil cases
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	// Direct comparison works for bool, string, int, etc.
	return a == b
}
