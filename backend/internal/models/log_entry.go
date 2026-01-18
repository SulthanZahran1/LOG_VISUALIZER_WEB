// Package models contains domain types for the PLC Log Visualizer.
package models

import "time"

// SignalType represents the type of a signal value.
type SignalType string

const (
	SignalTypeBoolean SignalType = "boolean"
	SignalTypeString  SignalType = "string"
	SignalTypeInteger SignalType = "integer"
)

// LogEntry represents a single log entry from a PLC log file.
type LogEntry struct {
	DeviceID   string      `json:"deviceId"`
	SignalName string      `json:"signalName"`
	Timestamp  time.Time   `json:"timestamp"`
	Value      interface{} `json:"value"` // bool, string, or int
	SignalType SignalType  `json:"signalType"`
	SourceID   string      `json:"sourceId,omitempty"` // File ID for merged sessions
}
