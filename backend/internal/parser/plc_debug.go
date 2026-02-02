package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// PLCDebugParser handles bracket-delimited logs.
// Format: "YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value"
type PLCDebugParser struct {
	lineRegex *regexp.Regexp
}

func NewPLCDebugParser() *PLCDebugParser {
	return &PLCDebugParser{
		lineRegex: regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^:\]]+):([^\]]+)\]\s+\(([^)]+)\)\s*:\s*(.*)\s*$`),
	}
}

func (p *PLCDebugParser) Name() string {
	return "plc_debug"
}

func (p *PLCDebugParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0
	for scanner.Scan() && checked < 10 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		checked++
		if p.lineRegex.MatchString(line) {
			matched++
		}
	}

	return checked > 0 && float64(matched)/float64(checked) >= 0.6, nil
}

func (p *PLCDebugParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	// Get file info for capacity estimation
	fileInfo, err := file.Stat()
	if err != nil {
		fileInfo = nil
	}

	// Dynamic pre-allocation based on file size
	// Estimate ~150 bytes per line average for PLC debug logs
	initialCapacity := 10000
	if fileInfo != nil {
		estimatedLines := int(fileInfo.Size() / 150)
		if estimatedLines > initialCapacity {
			initialCapacity = estimatedLines
			// Cap at 50M to avoid excessive pre-allocation for pathological files
			if initialCapacity > 50000000 {
				initialCapacity = 50000000
			}
		}
	}

	// Pre-allocate with estimated capacity for large files (reduces reallocations)
	entries := make([]models.LogEntry, 0, initialCapacity)
	errors := make([]*models.ParseError, 0, 100)
	signals := make(map[string]struct{}, 1000)
	devices := make(map[string]struct{}, 1000)

	// String interning for device IDs and signal names
	// This dramatically reduces memory for logs with repetitive device/signal names
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	// Increase buffer size for large log files (1MB instead of default 64KB)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		entry, parseErr := p.parseLine(line, lineNum, intern)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}

		entries = append(entries, *entry)
		signals[fmt.Sprintf("%s::%s", entry.DeviceID, entry.SignalName)] = struct{}{}
		devices[entry.DeviceID] = struct{}{}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

	var timeRange *models.TimeRange
	if len(entries) > 0 {
		timeRange = &models.TimeRange{
			Start: entries[0].Timestamp,
			End:   entries[len(entries)-1].Timestamp,
		}
	}

	return &models.ParsedLog{
		Entries:   entries,
		Signals:   signals,
		Devices:   devices,
		TimeRange: timeRange,
	}, errors, nil
}

func (p *PLCDebugParser) parseLine(line string, lineNum int, intern *StringIntern) (*models.LogEntry, *models.ParseError) {
	// Try fast path first (bracket splitting)
	entry := p.fastParseLine(line, intern)
	if entry != nil {
		return entry, nil
	}

	// Fallback to regex
	m := p.lineRegex.FindStringSubmatch(line)
	if m == nil {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "line does not match PLC debug format",
		}
	}

	tsStr := m[1]
	// level := m[2]
	path := m[3]
	category := strings.TrimSpace(m[4])
	signal := m[5]
	dtypeToken := strings.ToLower(m[6])
	valueStr := m[7]

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"}
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "device ID not found in path"}
	}

	// Intern device ID and signal name to reduce memory usage
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)
	category = intern.Intern(category)

	stype := models.SignalType(dtypeToken)
	if stype != models.SignalTypeBoolean && stype != models.SignalTypeInteger && stype != models.SignalTypeString {
		// Infer if not standard
		stype = InferType(valueStr)
	}

	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
		Category:   category,
	}, nil
}

func (p *PLCDebugParser) fastParseLine(line string, intern *StringIntern) *models.LogEntry {
	// Format: "YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value"
	if !strings.Contains(line, "[") || !strings.Contains(line, "(") {
		return nil
	}

	bracket1 := strings.Index(line, "[")
	if bracket1 == -1 {
		return nil
	}
	tsStr := strings.TrimSpace(line[:bracket1])

	bracket2 := strings.Index(line[bracket1+1:], "[")
	if bracket2 == -1 {
		return nil
	}
	bracket2 += bracket1 + 1

	bracket2Close := strings.Index(line[bracket2:], "]")
	if bracket2Close == -1 {
		return nil
	}
	bracket2Close += bracket2
	path := strings.TrimSpace(line[bracket2+1 : bracket2Close])

	bracket3 := strings.Index(line[bracket2Close+1:], "[")
	bracket3Close := strings.Index(line[bracket2Close+1:], "]")
	if bracket3 == -1 || bracket3Close == -1 {
		return nil
	}
	bracket3 += bracket2Close + 1
	bracket3Close += bracket2Close + 1
	catSignal := strings.TrimSpace(line[bracket3+1 : bracket3Close])

	colonIdx := strings.Index(catSignal, ":")
	if colonIdx == -1 {
		return nil
	}
	category := strings.TrimSpace(catSignal[:colonIdx])
	signal := strings.TrimSpace(catSignal[colonIdx+1:])

	parenOpen := strings.Index(line[bracket3Close:], "(")
	parenClose := strings.Index(line[bracket3Close:], ")")
	if parenOpen == -1 || parenClose == -1 {
		return nil
	}
	parenOpen += bracket3Close
	parenClose += bracket3Close
	dtypeToken := strings.ToLower(strings.TrimSpace(line[parenOpen+1 : parenClose]))

	colonSpace := strings.Index(line[parenClose:], ":")
	if colonSpace == -1 {
		return nil
	}
	colonSpace += parenClose
	valueStr := strings.TrimSpace(line[colonSpace+1:])

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil
	}

	// Intern strings to reduce memory usage
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)
	category = intern.Intern(category)

	stype := models.SignalType(dtypeToken)
	if stype != models.SignalTypeBoolean && stype != models.SignalTypeInteger && stype != models.SignalTypeString {
		stype = InferType(valueStr)
	}

	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
		Category:   category,
	}
}
