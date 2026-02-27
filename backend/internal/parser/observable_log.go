package parser

import (
	"bufio"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// ObservableLogParser handles OBSERVABLE backtick-delimited logs.
// Format:
//
//	date time status variables device-id datatype tag
//	YYYY-MM-DD HH:MM:SS:fff`OBSERVABLE`<variables>`<device-id>`<datatype>`<old>`<new>`<seq>`<tag>
type ObservableLogParser struct {
	timestampRegex *regexp.Regexp
}

func NewObservableLogParser() *ObservableLogParser {
	return &ObservableLogParser{
		timestampRegex: regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}:\d{3,9}$`),
	}
}

func (p *ObservableLogParser) Name() string {
	return "observable_log"
}

func (p *ObservableLogParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0

	for scanner.Scan() && checked < 20 {
		line := normalizeObservableLine(scanner.Text())
		if line == "" || isObservableHeaderLine(line) {
			continue
		}

		checked++
		if p.isObservableDataLine(line) {
			matched++
		}
	}

	if err := scanner.Err(); err != nil {
		return false, err
	}

	return checked > 0 && float64(matched)/float64(checked) >= 0.6, nil
}

func (p *ObservableLogParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *ObservableLogParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	fileInfo, err := file.Stat()
	if err != nil {
		fileInfo = nil
	}

	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	initialCapacity := 10000
	if fileInfo != nil {
		estimatedLines := int(fileInfo.Size() / 140)
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
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	const maxScannerBuffer = 1024 * 1024
	scanner.Buffer(make([]byte, 0, maxScannerBuffer), maxScannerBuffer)

	lineNum := 0
	var bytesRead int64
	lastProgressUpdate := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		line = normalizeObservableLine(line)
		if line == "" || isObservableHeaderLine(line) {
			continue
		}

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
		signalKey := entry.DeviceID + "::" + entry.SignalName
		signals[signalKey] = struct{}{}
		devices[entry.DeviceID] = struct{}{}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

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

func (p *ObservableLogParser) isObservableDataLine(line string) bool {
	parts := strings.Split(line, "`")
	if len(parts) != 9 {
		return false
	}

	ts := strings.TrimSpace(parts[0])
	if !p.timestampRegex.MatchString(ts) {
		return false
	}

	status := strings.TrimSpace(parts[1])
	if status != "OBSERVABLE" {
		return false
	}

	variableField := strings.TrimSpace(parts[2])
	deviceID := strings.TrimSpace(parts[3])
	dataType := strings.TrimSpace(parts[4])
	tag := strings.TrimSpace(parts[8])

	return variableField != "" && deviceID != "" && dataType != "" && tag != ""
}

func (p *ObservableLogParser) parseLine(line string, lineNum int, intern *StringIntern) (*models.LogEntry, *models.ParseError) {
	parts := strings.Split(line, "`")
	if len(parts) != 9 {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "line does not match observable format",
		}
	}

	ts, err := parseObservableTimestamp(strings.TrimSpace(parts[0]))
	if err != nil {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "invalid timestamp",
		}
	}

	if strings.TrimSpace(parts[1]) != "OBSERVABLE" {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "invalid observable status",
		}
	}

	variableField := strings.TrimSpace(parts[2])
	if variableField == "" {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "missing variable field",
		}
	}

	deviceID := strings.TrimSpace(parts[3])
	if deviceID == "" {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "missing device-id",
		}
	}

	dataType := strings.TrimSpace(parts[4])
	oldValue := strings.TrimSpace(parts[5])
	newValue := strings.TrimSpace(parts[6])

	valueRaw := newValue
	if valueRaw == "" {
		valueRaw = oldValue
	}

	signalName := extractObservableSignal(variableField)
	if signalName == "" {
		return nil, &models.ParseError{
			Line:    lineNum,
			Content: line,
			Reason:  "missing signal name",
		}
	}

	stype := inferObservableType(dataType, valueRaw)
	value := ParseValue(valueRaw, stype)

	deviceID = intern.Intern(deviceID)
	signalName = intern.Intern(signalName)

	return &models.LogEntry{
		DeviceID:   deviceID,
		SignalName: signalName,
		Timestamp:  ts,
		Value:      value,
		SignalType: stype,
	}, nil
}

func isObservableHeaderLine(line string) bool {
	fields := strings.Fields(strings.ToLower(strings.TrimSpace(line)))
	if len(fields) < 7 {
		return false
	}

	return fields[0] == "date" &&
		fields[1] == "time" &&
		fields[2] == "status" &&
		fields[3] == "variables" &&
		fields[4] == "device-id" &&
		fields[5] == "datatype" &&
		fields[6] == "tag"
}

func parseObservableTimestamp(ts string) (time.Time, error) {
	ts = strings.TrimSpace(ts)
	colon := strings.LastIndex(ts, ":")
	if colon > 18 {
		ts = ts[:colon] + "." + ts[colon+1:]
	}
	return FastTimestamp(ts)
}

func extractObservableSignal(variableField string) string {
	variableField = strings.TrimSpace(variableField)
	if variableField == "" {
		return ""
	}

	if idx := strings.LastIndex(variableField, ">>>"); idx >= 0 {
		s := strings.TrimSpace(variableField[idx+3:])
		if s != "" {
			return s
		}
	}

	if idx := strings.LastIndex(variableField, "<<<"); idx >= 0 {
		s := strings.TrimSpace(variableField[idx+3:])
		if s != "" {
			return s
		}
	}

	fields := strings.Fields(variableField)
	if len(fields) == 0 {
		return ""
	}
	return fields[len(fields)-1]
}

func inferObservableType(dataType string, value string) models.SignalType {
	if strings.TrimSpace(value) == "" {
		return models.SignalTypeString
	}

	switch strings.ToLower(strings.TrimSpace(dataType)) {
	case "boolean", "bool":
		return models.SignalTypeBoolean
	case "short", "integer", "int", "long", "dint", "uint", "ushort", "word", "dword":
		return models.SignalTypeInteger
	case "string", "text", "char":
		return models.SignalTypeString
	default:
		return InferType(value)
	}
}

func normalizeObservableLine(line string) string {
	// Some Windows-exported logs are UTF-16-like in transport paths and include NUL bytes.
	// Strip NUL bytes so ASCII delimiters can be detected reliably.
	if strings.IndexByte(line, 0) >= 0 {
		line = strings.ReplaceAll(line, "\x00", "")
	}

	// Handle common BOM variants.
	line = strings.TrimPrefix(line, "\ufeff")
	line = strings.TrimPrefix(line, "\xEF\xBB\xBF")
	line = strings.TrimPrefix(line, "\xFF\xFE")
	line = strings.TrimPrefix(line, "\xFE\xFF")

	return strings.TrimSpace(line)
}
