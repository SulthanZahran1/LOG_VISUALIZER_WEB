package models

// SessionStatus represents the status of a parse session.
type SessionStatus string

const (
	SessionStatusPending  SessionStatus = "pending"
	SessionStatusParsing  SessionStatus = "parsing"
	SessionStatusComplete SessionStatus = "complete"
	SessionStatusError    SessionStatus = "error"
)

// ParseSession represents a file parsing session.
type ParseSession struct {
	ID               string        `json:"id"`
	FileID           string        `json:"fileId"`
	FileIDs          []string      `json:"fileIds,omitempty"` // All file IDs for merged sessions
	Status           SessionStatus `json:"status"`
	Progress         float64       `json:"progress"` // 0-100
	EntryCount       int           `json:"entryCount,omitempty"`
	SignalCount      int           `json:"signalCount,omitempty"`
	ProcessingTimeMs int64         `json:"processingTimeMs,omitempty"`
	StartTime        int64         `json:"startTime,omitempty"` // Unix ms
	EndTime          int64         `json:"endTime,omitempty"`   // Unix ms
	ParserName       string        `json:"parserName,omitempty"`
	Errors           []ParseError  `json:"errors,omitempty"`
}

// ParseError represents an error encountered during parsing.
type ParseError struct {
	Line    int    `json:"line"`
	Content string `json:"content"`
	Reason  string `json:"reason"`
}

// NewParseSession creates a new ParseSession in pending status.
func NewParseSession(id, fileID string) *ParseSession {
	return &ParseSession{
		ID:       id,
		FileID:   fileID,
		Status:   SessionStatusPending,
		Progress: 0,
		Errors:   make([]ParseError, 0),
	}
}
