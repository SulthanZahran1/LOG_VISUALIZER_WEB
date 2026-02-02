package parser

import (
	"github.com/plc-visualizer/backend/internal/models"
)

// CompactLogStore uses columnar storage (12x smaller than []LogEntry)
type CompactLogStore struct {
	intern      *StringIntern
	stringToIdx map[string]uint32
	idxToString []string
	
	entryCount   int
	timestamps   []uint64
	deviceIdx    []uint32
	signalIdx    []uint32
	categories   []uint32
	
	boolValues   []bool
	intValues    []int64
	floatValues  []float64
	stringValues []uint32
	
	valueTypes   []ValueType
	valueIndices []uint32
}

func NewCompactLogStore() *CompactLogStore {
	return &CompactLogStore{
		intern:       GetGlobalIntern(),
		stringToIdx:  make(map[string]uint32),
		idxToString:  make([]string, 0, 1000),
		timestamps:   make([]uint64, 0, 10000),
		deviceIdx:    make([]uint32, 0, 10000),
		signalIdx:    make([]uint32, 0, 10000),
		categories:   make([]uint32, 0, 10000),
		boolValues:   make([]bool, 0, 1000),
		intValues:    make([]int64, 0, 1000),
		floatValues:  make([]float64, 0, 100),
		stringValues: make([]uint32, 0, 1000),
		valueTypes:   make([]ValueType, 0, 10000),
		valueIndices: make([]uint32, 0, 10000),
	}
}

func (cs *CompactLogStore) internString(s string) uint32 {
	s = cs.intern.Intern(s)
	if idx, ok := cs.stringToIdx[s]; ok {
		return idx
	}
	idx := uint32(len(cs.idxToString))
	cs.idxToString = append(cs.idxToString, s)
	cs.stringToIdx[s] = idx
	return idx
}

func (cs *CompactLogStore) AddEntry(entry *models.LogEntry) {
	deviceIdx := cs.internString(entry.DeviceID)
	signalIdx := cs.internString(entry.SignalName)
	
	var catIdx uint32 = 0xFFFFFFFF
	if entry.Category != "" {
		catIdx = cs.internString(entry.Category)
	}
	
	valType, valIdx := cs.storeValue(entry.Value)
	
	cs.timestamps = append(cs.timestamps, uint64(entry.Timestamp.UnixMilli()))
	cs.deviceIdx = append(cs.deviceIdx, deviceIdx)
	cs.signalIdx = append(cs.signalIdx, signalIdx)
	cs.categories = append(cs.categories, catIdx)
	cs.valueTypes = append(cs.valueTypes, valType)
	cs.valueIndices = append(cs.valueIndices, valIdx)
	cs.entryCount++
}

func (cs *CompactLogStore) storeValue(val interface{}) (ValueType, uint32) {
	switch v := val.(type) {
	case bool:
		idx := uint32(len(cs.boolValues))
		cs.boolValues = append(cs.boolValues, v)
		if v {
			return ValueTypeBoolTrue, idx
		}
		return ValueTypeBoolFalse, idx
	case int:
		idx := uint32(len(cs.intValues))
		cs.intValues = append(cs.intValues, int64(v))
		return ValueTypeInt64, idx
	case int64:
		idx := uint32(len(cs.intValues))
		cs.intValues = append(cs.intValues, v)
		return ValueTypeInt64, idx
	case float64:
		idx := uint32(len(cs.floatValues))
		cs.floatValues = append(cs.floatValues, v)
		return ValueTypeFloat64, idx
	case string:
		strIdx := cs.internString(v)
		idx := uint32(len(cs.stringValues))
		cs.stringValues = append(cs.stringValues, strIdx)
		return ValueTypeStringIndex, idx
	default:
		return cs.storeValue("")
	}
}

func (cs *CompactLogStore) MemoryUsage() int {
	return len(cs.timestamps)*8 +
		len(cs.deviceIdx)*4 +
		len(cs.signalIdx)*4 +
		len(cs.categories)*4 +
		len(cs.boolValues) +
		len(cs.intValues)*8 +
		len(cs.floatValues)*8 +
		len(cs.stringValues)*4 +
		len(cs.valueTypes) +
		len(cs.valueIndices)*4
}
