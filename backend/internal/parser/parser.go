package parser

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// Parser defines the interface for log file parsers.
type Parser interface {
	// Name returns the unique name of the parser.
	Name() string
	// CanParse returns true if this parser can handle the given file.
	CanParse(filePath string) (bool, error)
	// Parse parses the entire file and returns the result.
	Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error)
}

// Common utilities for parsing

var (
	// DeviceIDRegex is the default regex for extracting device ID from a path.
	// Matches: "DEVICE-123", "DEVICE-123@D19" (extracts "DEVICE-123")
	DeviceIDRegex = regexp.MustCompile(`([A-Za-z0-9_-]+)(?:@[^\]]+)?$`)

	// Numeric detection regexes
	intRegex   = regexp.MustCompile(`^[+-]?(?:0[xX][0-9A-Fa-f_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_,]*)$`)
	floatRegex = regexp.MustCompile(`^[+-]?(?:\d[\d_,]*\.\d+|\.\d+|\d+\.)(?:[eE][+-]?\d+)?$|^[+-]?\d+(?:[eE][+-]?\d+)$`)

	boolTrue  = map[string]bool{"ON": true, "TRUE": true, "1": true, "YES": true}
	boolFalse = map[string]bool{"OFF": true, "FALSE": true, "0": true, "NO": true}
)

// InferType guesses the SignalType of a raw string.
func InferType(raw string) models.SignalType {
	s := strings.TrimSpace(raw)
	if s == "" {
		return models.SignalTypeString
	}

	u := strings.ToUpper(s)
	if _, ok := boolTrue[u]; ok {
		return models.SignalTypeBoolean
	}
	if _, ok := boolFalse[u]; ok {
		return models.SignalTypeBoolean
	}

	if intRegex.MatchString(s) {
		return models.SignalTypeInteger
	}

	// For now we don't have Float in models.SignalType, so we treat it as String or Integer
	// If it matches float regex, but not int, we return string (or we could add Float to models)
	// The Python reference mentions SignalType.FLOAT as optional.
	return models.SignalTypeString
}

// ParseValue converts a raw string to its typed interface value based on SignalType.
func ParseValue(raw string, stype models.SignalType) interface{} {
	s := strings.TrimSpace(raw)

	switch stype {
	case models.SignalTypeBoolean:
		u := strings.ToUpper(s)
		if _, ok := boolTrue[u]; ok {
			return true
		}
		if _, ok := boolFalse[u]; ok {
			return false
		}
		return s // Fallback

	case models.SignalTypeInteger:
		t := strings.ReplaceAll(s, ",", "")
		t = strings.ReplaceAll(t, "_", "")

		// Handle hex, octal, binary
		var val int64
		var err error
		if strings.HasPrefix(t, "0x") || strings.HasPrefix(t, "0X") || strings.HasPrefix(t, "+0x") || strings.HasPrefix(t, "-0x") {
			val, err = strconv.ParseInt(t, 0, 64)
		} else if strings.HasPrefix(t, "0b") || strings.HasPrefix(t, "0B") {
			// strconv.ParseInt handles 0x, but not 0b directly without specific base
			t0b := strings.TrimPrefix(t, "0b")
			t0b = strings.TrimPrefix(t0b, "0B")
			val, err = strconv.ParseInt(t0b, 2, 64)
		} else {
			val, err = strconv.ParseInt(t, 10, 64)
		}

		if err != nil {
			return s // Fallback
		}
		return int(val)

	default:
		return s
	}
}

// FastTimestamp parses "%Y-%m-%d %H:%M:%S.%f".
func FastTimestamp(ts string) (time.Time, error) {
	// Example: "2025-09-25 06:02:11.086"
	// Layout for Go: "2006-01-02 15:04:05.999" (Go uses 9s for optional fractional parts)
	return time.Parse("2006-01-02 15:04:05.999999999", ts)
}

// ExtractDeviceID uses the default DeviceIDRegex.
func ExtractDeviceID(path string) string {
	m := DeviceIDRegex.FindStringSubmatch(path)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}
