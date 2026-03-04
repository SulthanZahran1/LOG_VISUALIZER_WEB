package parser

import (
	"bufio"
	"os"
	"regexp"
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// GenericLogParser handles simple timestamped log files.
// Matches many common formats starting with "YYYY-MM-DD HH:MM:SS"
type GenericLogParser struct {
	lineRegex *regexp.Regexp
}

func NewGenericLogParser() *GenericLogParser {
	return &GenericLogParser{
		// Matches: "2023-10-27 10:20:30.123 [INFO] This is a message"
		// or: "2023-10-27 10:20:30 [DEBUG] Another message"
		lineRegex: regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(?:\[([^\]]+)\]\s+)?(.*)$`),
	}
}

func (p *GenericLogParser) Name() string {
	return "generic_log"
}

func (p *GenericLogParser) CanParse(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	checked := 0
	matched := 0
	for scanner.Scan() && checked < 20 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		checked++
		if p.lineRegex.MatchString(line) {
			matched++
		}
	}

	// Lower threshold than specific parsers to catch generic logs
	return checked > 0 && float64(matched)/float64(checked) >= 0.5, nil
}

func (p *GenericLogParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *GenericLogParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	totalBytes := fileInfo.Size()

	parsed := models.NewParsedLog()
	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	var bytesRead int64

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		if strings.TrimSpace(line) == "" {
			continue
		}

		m := p.lineRegex.FindStringSubmatch(line)
		if m == nil {
			// If it doesn't match the timestamp, maybe it's a multi-line log?
			// For now, treat as error or skip
			continue
		}

		tsStr, level, msg := m[1], m[2], m[3]
		ts, err := FastTimestamp(tsStr)
		if err != nil {
			errors = append(errors, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"})
			continue
		}

		if level == "" {
			level = "INFO"
		}

		entry := models.LogEntry{
			DeviceID:   intern.Intern("system"),
			SignalName: intern.Intern(level),
			Timestamp:  ts,
			Value:      msg,
			SignalType: models.SignalTypeString,
		}

		parsed.Entries = append(parsed.Entries, entry)
		parsed.Signals[level] = struct{}{}
		parsed.Devices["system"] = struct{}{}

		if onProgress != nil && lineNum%10000 == 0 {
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}

	return parsed, errors, nil
}

func (p *GenericLogParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	scanner := bufio.NewScanner(file)
	lineNum := 0
	var bytesRead int64

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		bytesRead += int64(len(line)) + 1

		if strings.TrimSpace(line) == "" {
			continue
		}

		m := p.lineRegex.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		tsStr, level, msg := m[1], m[2], m[3]
		ts, err := FastTimestamp(tsStr)
		if err != nil {
			errors = append(errors, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"})
			continue
		}

		if level == "" {
			level = "INFO"
		}

		entry := models.LogEntry{
			DeviceID:   intern.Intern("system"),
			SignalName: intern.Intern(level),
			Timestamp:  ts,
			Value:      msg,
			SignalType: models.SignalTypeString,
		}
		store.AddEntry(&entry)

		if onProgress != nil && lineNum%10000 == 0 {
			onProgress(lineNum, bytesRead, totalBytes)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
	}

	return errors, nil
}
