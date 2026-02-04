package parser

import (
	"bufio"
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
	return p.ParseWithProgress(filePath, nil)
}

func (p *PLCTabParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	// Get file info for progress tracking
	fileInfo, err := file.Stat()
	if err != nil {
		fileInfo = nil
	}
	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	// Dynamic pre-allocation based on file size
	// Tab-delimited logs vary, estimate ~120 bytes per line
	initialCapacity := 10000
	if fileInfo != nil {
		estimatedLines := int(fileInfo.Size() / 120)
		if estimatedLines > initialCapacity {
			initialCapacity = estimatedLines
			if initialCapacity > 50000000 {
				initialCapacity = 50000000
			}
		}
	}

	entries := make([]models.LogEntry, 0, initialCapacity)
	errors := make([]*models.ParseError, 0, 100)
	signals := make(map[string]struct{}, 1000)
	devices := make(map[string]struct{}, 1000)

	// String interning for device IDs and signal names
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	// Increase buffer size for large log files (1MB instead of default 64KB)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)
	lineNum := 0
	var bytesRead int64
	lastProgressUpdate := 0
	
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1
		
		if strings.TrimSpace(line) == "" {
			continue
		}
		
		// Report progress every 100K lines
		if onProgress != nil && lineNum%100000 == 0 && lineNum != lastProgressUpdate {
			lastProgressUpdate = lineNum
			onProgress(lineNum, bytesRead, totalBytes)
		}

		entry, parseErr := p.parseLine(line, lineNum, intern)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}

		entries = append(entries, *entry)
		signals[entry.DeviceID+"::"+entry.SignalName] = struct{}{}
		devices[entry.DeviceID] = struct{}{}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

	// Final progress update
	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
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

func (p *PLCTabParser) parseLine(line string, lineNum int, intern *StringIntern) (*models.LogEntry, *models.ParseError) {
	// Try fast path first (index based)
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

	// Intern strings
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)

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

func (p *PLCTabParser) fastParseLine(line string, intern *StringIntern) *models.LogEntry {
	// Format: "YYYY-MM-DD HH:MM:SS.fff [] path\tsignal\tdirection\tvalue\t..."
	// Find " [] " marker
	bracketIdx := strings.Index(line, " [] ")
	if bracketIdx == -1 {
		return nil
	}

	tsStr := strings.TrimSpace(line[:bracketIdx])
	if len(tsStr) < 19 {
		return nil
	}

	remainder := line[bracketIdx+4:]

	// Find tabs using IndexByte instead of Split (avoids slice allocation)
	// We need: parts[0]=path, parts[1]=signal, parts[3]=value
	tab1 := strings.IndexByte(remainder, '\t')
	if tab1 == -1 {
		return nil
	}
	path := strings.TrimSpace(remainder[:tab1])

	rest := remainder[tab1+1:]
	tab2 := strings.IndexByte(rest, '\t')
	if tab2 == -1 {
		return nil
	}
	signal := strings.TrimSpace(rest[:tab2])

	rest = rest[tab2+1:]
	tab3 := strings.IndexByte(rest, '\t')
	if tab3 == -1 {
		return nil
	}
	// Skip parts[2] (direction)

	rest = rest[tab3+1:]
	tab4 := strings.IndexByte(rest, '\t')
	var valueStr string
	if tab4 == -1 {
		valueStr = strings.TrimSpace(rest)
	} else {
		valueStr = strings.TrimSpace(rest[:tab4])
	}

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		return nil
	}

	deviceID := ExtractDeviceID(path)
	if deviceID == "" {
		return nil
	}

	// Intern strings
	deviceID = intern.Intern(deviceID)
	signal = intern.Intern(signal)

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
