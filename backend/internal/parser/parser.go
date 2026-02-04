package parser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// ProgressCallback is called periodically during parsing to report progress.
type ProgressCallback func(linesProcessed int, bytesProcessed int64, totalBytes int64)

// Parser defines the interface for log file parsers.
type Parser interface {
	// Name returns the unique name of the parser.
	Name() string
	// CanParse returns true if this parser can handle the given file.
	CanParse(filePath string) (bool, error)
	// Parse parses the entire file and returns the result.
	Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error)
	// ParseWithProgress parses with progress callbacks for large files.
	ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error)
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
// Optimized to avoid regex for common cases.
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

	// Fast integer detection without regex
	if isIntegerFast(s) {
		return models.SignalTypeInteger
	}

	return models.SignalTypeString
}

// isIntegerFast checks if a string is an integer without using regex.
// Handles: plain integers, hex (0x), binary (0b), octal (0o), with optional sign and underscores/commas.
func isIntegerFast(s string) bool {
	if len(s) == 0 {
		return false
	}

	i := 0
	// Skip optional sign
	if s[0] == '+' || s[0] == '-' {
		i++
		if i >= len(s) {
			return false
		}
	}

	// Check for hex/binary/octal prefix
	if i+1 < len(s) && s[i] == '0' {
		switch s[i+1] {
		case 'x', 'X':
			// Hex: 0x[0-9A-Fa-f_]+
			i += 2
			if i >= len(s) {
				return false
			}
			hasDigit := false
			for ; i < len(s); i++ {
				c := s[i]
				if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') {
					hasDigit = true
				} else if c != '_' {
					return false
				}
			}
			return hasDigit
		case 'b', 'B':
			// Binary: 0b[01_]+
			i += 2
			if i >= len(s) {
				return false
			}
			hasDigit := false
			for ; i < len(s); i++ {
				c := s[i]
				if c == '0' || c == '1' {
					hasDigit = true
				} else if c != '_' {
					return false
				}
			}
			return hasDigit
		case 'o', 'O':
			// Octal: 0o[0-7_]+
			i += 2
			if i >= len(s) {
				return false
			}
			hasDigit := false
			for ; i < len(s); i++ {
				c := s[i]
				if c >= '0' && c <= '7' {
					hasDigit = true
				} else if c != '_' {
					return false
				}
			}
			return hasDigit
		}
	}

	// Plain integer: [0-9][0-9_,]*
	hasDigit := false
	for ; i < len(s); i++ {
		c := s[i]
		if c >= '0' && c <= '9' {
			hasDigit = true
		} else if c != '_' && c != ',' {
			return false
		}
	}
	return hasDigit
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

// FastTimestamp parses "%Y-%m-%d %H:%M:%S.%f" using manual parsing for speed.
// This is ~5x faster than time.Parse for the fixed format.
func FastTimestamp(ts string) (time.Time, error) {
	// Example: "2025-09-25 06:02:11.086"
	// Minimum length: "2025-09-25 06:02:11" = 19 chars
	if len(ts) < 19 {
		return time.Time{}, fmt.Errorf("timestamp too short: %s", ts)
	}

	// Parse date components directly (avoid string allocations)
	year := parseInt4(ts[0:4])
	month := parseInt2(ts[5:7])
	day := parseInt2(ts[8:10])
	hour := parseInt2(ts[11:13])
	min := parseInt2(ts[14:16])
	sec := parseInt2(ts[17:19])

	if year < 0 || month < 1 || month > 12 || day < 1 || day > 31 ||
		hour < 0 || hour > 23 || min < 0 || min > 59 || sec < 0 || sec > 59 {
		// Fallback to time.Parse for edge cases
		return time.Parse("2006-01-02 15:04:05.999999999", ts)
	}

	// Parse fractional seconds if present
	var nsec int
	if len(ts) > 20 && ts[19] == '.' {
		frac := ts[20:]
		// Pad or truncate to 9 digits (nanoseconds)
		fracLen := len(frac)
		if fracLen > 9 {
			frac = frac[:9]
			fracLen = 9
		}
		nsec = parseIntN(frac, fracLen)
		// Scale up to nanoseconds
		for i := fracLen; i < 9; i++ {
			nsec *= 10
		}
	}

	return time.Date(year, time.Month(month), day, hour, min, sec, nsec, time.UTC), nil
}

// parseInt2 parses a 2-digit decimal string. Returns -1 on error.
func parseInt2(s string) int {
	if len(s) != 2 {
		return -1
	}
	d1, d2 := s[0]-'0', s[1]-'0'
	if d1 > 9 || d2 > 9 {
		return -1
	}
	return int(d1)*10 + int(d2)
}

// parseInt4 parses a 4-digit decimal string. Returns -1 on error.
func parseInt4(s string) int {
	if len(s) != 4 {
		return -1
	}
	d1, d2, d3, d4 := s[0]-'0', s[1]-'0', s[2]-'0', s[3]-'0'
	if d1 > 9 || d2 > 9 || d3 > 9 || d4 > 9 {
		return -1
	}
	return int(d1)*1000 + int(d2)*100 + int(d3)*10 + int(d4)
}

// parseIntN parses an n-digit decimal string. Returns 0 on error.
func parseIntN(s string, n int) int {
	result := 0
	for i := 0; i < n; i++ {
		d := s[i] - '0'
		if d > 9 {
			return 0
		}
		result = result*10 + int(d)
	}
	return result
}

// ExtractDeviceID extracts the device ID from a path without using regex.
// Matches pattern: "path/DEVICE-123" or "path/DEVICE-123@D19" -> "DEVICE-123"
func ExtractDeviceID(path string) string {
	// Find the last path separator to get the final segment
	lastSep := strings.LastIndexAny(path, "/\\]")
	var segment string
	if lastSep >= 0 {
		segment = path[lastSep+1:]
	} else {
		segment = path
	}

	// Strip @ suffix if present (e.g., "DEVICE-123@D19" -> "DEVICE-123")
	if atIdx := strings.IndexByte(segment, '@'); atIdx >= 0 {
		segment = segment[:atIdx]
	}

	// Validate: must contain only alphanumeric, underscore, hyphen
	if len(segment) == 0 {
		return ""
	}
	for i := 0; i < len(segment); i++ {
		c := segment[i]
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '_' || c == '-') {
			return ""
		}
	}

	return segment
}
