package parser

import (
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// CompactLogStore uses columnar storage (12x smaller than []LogEntry)
// Memory optimization: Uses global string interner directly instead of duplicating strings
type CompactLogStore struct {
	intern *StringIntern
	
	entryCount   int
	timestamps   []int64
	deviceIDs    []string // Interned string references (8 bytes each, pointing to shared pool)
	signalNames  []string // Interned string references
	categories   []string // Interned string references (empty string for none)
	values       []Value  // Unified value storage
	
	// Signal type resolution: maps "device::signal" to resolved type
	// This is populated by ResolveSignalTypes() to upgrade boolean signals
	// that have non-0/1 values to integer type
	signalTypes map[string]models.SignalType
}

// Value stores typed values efficiently using existing ValueType constants
type Value struct {
	Type  ValueType
	Bool  bool
	Int   int64
	Float float64
	Str   string // Interned string reference
}

// Local ValueType constants (matching binary_format.go but with simpler names)
const (
	ValueTypeBool   ValueType = iota // Use separate bool values
	ValueTypeInt                     // int64 stored
	ValueTypeFloat                   // float64 stored
	ValueTypeString                  // interned string reference
)

func NewCompactLogStore() *CompactLogStore {
	return &CompactLogStore{
		intern:      GetGlobalIntern(),
		timestamps:  make([]int64, 0, 10000),
		deviceIDs:   make([]string, 0, 10000),
		signalNames: make([]string, 0, 10000),
		categories:  make([]string, 0, 10000),
		values:      make([]Value, 0, 10000),
	}
}

func (cs *CompactLogStore) AddEntry(entry *models.LogEntry) {
	// Intern strings and store references (not copies)
	deviceID := cs.intern.Intern(entry.DeviceID)
	signalName := cs.intern.Intern(entry.SignalName)
	
	var category string
	if entry.Category != "" {
		category = cs.intern.Intern(entry.Category)
	}
	
	val := cs.storeValue(entry.Value)
	
	cs.timestamps = append(cs.timestamps, entry.Timestamp.UnixMilli())
	cs.deviceIDs = append(cs.deviceIDs, deviceID)
	cs.signalNames = append(cs.signalNames, signalName)
	cs.categories = append(cs.categories, category)
	cs.values = append(cs.values, val)
	cs.entryCount++
}

func (cs *CompactLogStore) storeValue(val interface{}) Value {
	switch v := val.(type) {
	case bool:
		return Value{Type: ValueTypeBool, Bool: v}
	case int:
		return Value{Type: ValueTypeInt, Int: int64(v)}
	case int64:
		return Value{Type: ValueTypeInt, Int: v}
	case float64:
		return Value{Type: ValueTypeFloat, Float: v}
	case string:
		return Value{Type: ValueTypeString, Str: cs.intern.Intern(v)}
	default:
		return Value{Type: ValueTypeString, Str: ""}
	}
}

func (cs *CompactLogStore) MemoryUsage() int {
	// Only count slice overhead, not string contents (shared in interner)
	return len(cs.timestamps)*8 +
		len(cs.deviceIDs)*8 + // 8 bytes per string header (pointer + len)
		len(cs.signalNames)*8 +
		len(cs.categories)*8 +
		len(cs.values)*32 // Value struct ~32 bytes
}

// GetEntry returns a single entry by index (on-demand conversion)
func (cs *CompactLogStore) GetEntry(i int) models.LogEntry {
	val := cs.values[i]
	entry := models.LogEntry{
		Timestamp:  time.UnixMilli(cs.timestamps[i]),
		DeviceID:   cs.deviceIDs[i],
		SignalName: cs.signalNames[i],
		Category:   cs.categories[i],
	}
	
	// Check if we have a resolved signal type (after ResolveSignalTypes() is called)
	signalKey := cs.deviceIDs[i] + "::" + cs.signalNames[i]
	if resolvedType, ok := cs.signalTypes[signalKey]; ok {
		// Use resolved type - convert bool values to 0/1 for integer signals
		switch resolvedType {
		case models.SignalTypeBoolean:
			if val.Type == ValueTypeBool {
				entry.Value = val.Bool
			} else if val.Type == ValueTypeInt {
				entry.Value = val.Int != 0
			}
			entry.SignalType = models.SignalTypeBoolean
			return entry
		case models.SignalTypeInteger:
			if val.Type == ValueTypeBool {
				// Convert bool to 0/1 for integer signals
				if val.Bool {
					entry.Value = 1
				} else {
					entry.Value = 0
				}
			} else if val.Type == ValueTypeInt {
				entry.Value = int(val.Int)
			}
			entry.SignalType = models.SignalTypeInteger
			return entry
		default:
			// Fall through to value-based type for strings
		}
	}
	
	// Default: use value-based type detection
	switch val.Type {
	case ValueTypeBool:
		entry.Value = val.Bool
		entry.SignalType = models.SignalTypeBoolean
	case ValueTypeInt:
		entry.Value = int(val.Int)
		entry.SignalType = models.SignalTypeInteger
	case ValueTypeFloat:
		entry.Value = val.Float
		entry.SignalType = models.SignalTypeString
	case ValueTypeString:
		entry.Value = val.Str
		entry.SignalType = models.SignalTypeString
	}
	
	return entry
}

// ResolveSignalTypes scans all values and determines per-signal types.
// If a signal has any non-0/1 integer values, it's upgraded to integer type.
// This should be called after all entries are added.
func (cs *CompactLogStore) ResolveSignalTypes() {
	cs.signalTypes = make(map[string]models.SignalType, len(cs.deviceIDs))
	
	// First pass: determine if each signal needs integer type
	for i := 0; i < cs.entryCount; i++ {
		signalKey := cs.deviceIDs[i] + "::" + cs.signalNames[i]
		val := cs.values[i]
		
		// If we already determined this signal is integer, skip
		if cs.signalTypes[signalKey] == models.SignalTypeInteger {
			continue
		}
		
		switch val.Type {
		case ValueTypeInt:
			// Non-0/1 integers force integer type
			if val.Int != 0 && val.Int != 1 {
				cs.signalTypes[signalKey] = models.SignalTypeInteger
			} else {
				// 0/1 could be boolean or integer - mark as tentative boolean
				if cs.signalTypes[signalKey] == "" {
					cs.signalTypes[signalKey] = models.SignalTypeBoolean
				}
			}
		case ValueTypeBool:
			// Boolean values - only set if not already set to integer
			if cs.signalTypes[signalKey] == "" {
				cs.signalTypes[signalKey] = models.SignalTypeBoolean
			}
		default:
			// Strings and floats stay as string type
			cs.signalTypes[signalKey] = models.SignalTypeString
		}
	}
}

// Len returns the number of entries
func (cs *CompactLogStore) Len() int {
	return cs.entryCount
}

// GetSignals returns all unique signals
func (cs *CompactLogStore) GetSignals() map[string]struct{} {
	signals := make(map[string]struct{}, 1000)
	for i := 0; i < cs.entryCount; i++ {
		signals[cs.deviceIDs[i]+"::"+cs.signalNames[i]] = struct{}{}
	}
	return signals
}

// GetDevices returns all unique devices
func (cs *CompactLogStore) GetDevices() map[string]struct{} {
	devices := make(map[string]struct{}, 1000)
	for i := 0; i < cs.entryCount; i++ {
		devices[cs.deviceIDs[i]] = struct{}{}
	}
	return devices
}

// GetTimeRange returns the time range of the log
func (cs *CompactLogStore) GetTimeRange() *models.TimeRange {
	if cs.entryCount == 0 {
		return nil
	}
	return &models.TimeRange{
		Start: time.UnixMilli(cs.timestamps[0]),
		End:   time.UnixMilli(cs.timestamps[cs.entryCount-1]),
	}
}

// ToParsedLog converts compact storage to ParsedLog for API compatibility
// WARNING: This creates a full copy of all entries in memory (~1.3GB for 11M entries)
// Use GetEntry() for on-demand access instead to save memory
func (cs *CompactLogStore) ToParsedLog() *models.ParsedLog {
	entries := make([]models.LogEntry, 0, cs.entryCount)
	
	for i := 0; i < cs.entryCount; i++ {
		entries = append(entries, cs.GetEntry(i))
	}
	
	return &models.ParsedLog{
		Entries:   entries,
		Signals:   cs.GetSignals(),
		Devices:   cs.GetDevices(),
		TimeRange: cs.GetTimeRange(),
	}
}
