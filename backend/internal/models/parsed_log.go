package models

import "time"

// ParsedLog represents the result of parsing a log file.
type ParsedLog struct {
	Entries   []LogEntry          `json:"entries"`
	Signals   map[string]struct{} `json:"signals"`
	Devices   map[string]struct{} `json:"devices"`
	TimeRange *TimeRange          `json:"timeRange,omitempty"`
}

// TimeRange represents a time window.
type TimeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// NewParsedLog creates a new empty ParsedLog.
func NewParsedLog() *ParsedLog {
	return &ParsedLog{
		Entries: make([]LogEntry, 0),
		Signals: make(map[string]struct{}),
		Devices: make(map[string]struct{}),
	}
}
