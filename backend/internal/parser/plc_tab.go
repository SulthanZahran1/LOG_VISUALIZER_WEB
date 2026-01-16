package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// PLCTabParser handles tab-delimited logs.
// Format: "YYYY-MM-DD HH:MM:SS.fff [] path\tsignal\tdirection\tvalue\t..."
type PLCTabParser struct {
	lineRegex *regexp.Regexp
}

func NewPLCTabParser() *PLCTabParser {
	return &PLCTabParser{
		lineRegex: regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s\[\]\s([^\t]+)\t([^\t]+)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)(?:\t([^\t]*))?\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s*$`),
	}
}

func (p *PLCTabParser) Name() string {
	return "plc_tab"
}

func (p *PLCTabParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0
	for scanner.Scan() && checked < 10 {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		checked++
		if p.lineRegex.MatchString(line) {
			matched++
		}
	}

	return checked > 0 && float64(matched)/float64(checked) >= 0.6, nil
}

func (p *PLCTabParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	entries := make([]models.LogEntry, 0)
	errors := make([]*models.ParseError, 0)
	signals := make(map[string]struct{})
	devices := make(map[string]struct{})

	scanner := bufio.NewScanner(file)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		entry, parseErr := p.parseLine(line, lineNum)
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

func (p *PLCTabParser) parseLine(line string, lineNum int) (*models.LogEntry, *models.ParseError) {
	// Try fast path first (index based)
	entry := p.fastParseLine(line)
	if entry != nil {
		return entry, nil
	}

	// Fallback to regex
	m := p.lineRegex.FindStringSubmatch(line)
	if m == nil {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "line does not match PLC tab format",
		}
	}

	tsStr := m[1]
	path := m[2]
	signal := m[3]
	// direction := m[4]
	valueStr := m[5]

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"}
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "device ID not found in path"}
	}

	stype := InferType(valueStr)
	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
	}, nil
}

func (p *PLCTabParser) fastParseLine(line string) *models.LogEntry {
	if !strings.Contains(line, "\t") {
		return nil
	}

	bracketIdx := strings.Index(line, " [] ")
	if bracketIdx == -1 {
		return nil
	}

	tsStr := strings.TrimSpace(line[:bracketIdx])
	if len(tsStr) < 19 {
		return nil
	}

	remainder := line[bracketIdx+4:]
	parts := strings.Split(remainder, "\t")
	if len(parts) < 8 {
		return nil
	}

	path := strings.TrimSpace(parts[0])
	signal := strings.TrimSpace(parts[1])
	valueStr := strings.TrimSpace(parts[3])

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil
	}

	stype := InferType(valueStr)
	value := ParseValue(valueStr, stype)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signal,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
	}
}
