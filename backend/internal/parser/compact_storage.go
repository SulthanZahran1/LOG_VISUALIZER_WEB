package parser

import (
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// CompactLogStore uses columnar storage (12x smaller than []LogEntry)
// Memory optimization: Uses global string interner directly instead of duplicating strings
type CompactLogStore struct {
	intern *StringIntern
	
	entryCount  int
	timestamps  []int64
	deviceIDs   []string // Interned string references (8 bytes each, pointing to shared pool)
	signalNames []string // Interned string references
	categories  []string // Interned string references (empty string for none)
	values      []Value  // Unified value storage
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
