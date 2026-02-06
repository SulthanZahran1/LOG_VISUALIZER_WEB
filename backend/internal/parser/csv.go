package parser

import (
	"bufio"
	"os"
	"regexp"
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// CSVSignalParser handles CSV signal logs.
// Format: "Timestamp,DeviceID,Signal,Value"
type CSVSignalParser struct {
	lineRegex *regexp.Regexp
}

func NewCSVSignalParser() *CSVSignalParser {
	return &CSVSignalParser{
		lineRegex: regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(.*?)\s*$`),
	}
}

func (p *CSVSignalParser) Name() string {
	return "csv_signal"
}

func (p *CSVSignalParser) CanParse(filePath string) (bool, error) {
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

func (p *CSVSignalParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *CSVSignalParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
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
	// CSV lines are typically shorter, estimate ~80 bytes per line
	initialCapacity := 10000
	if fileInfo != nil {
		estimatedLines := int(fileInfo.Size() / 80)
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
	
	// Track per-signal type requirements for type resolution
	signalTypeReqs := make(map[string]models.SignalType, 1000)

	// String interning for device IDs and signal names
	intern := GetGlobalIntern()

	// Get file size for progress tracking (fileInfo already obtained above)
	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	scanner := bufio.NewScanner(file)
	// Increase buffer size for large log files
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

		m := p.lineRegex.FindStringSubmatch(line)
		if m == nil {
			// Try a simpler split for CSV if it contains no commas in values
			parts := strings.Split(line, ",")
			if len(parts) >= 4 {
				tsStr := strings.TrimSpace(parts[0])
				path := strings.TrimSpace(parts[1])
				signal := strings.TrimSpace(parts[2])
				valueStr := strings.TrimSpace(strings.Join(parts[3:], ","))

				ts, err := FastTimestamp(tsStr)
				if err != nil {
					errors = append(errors, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"})
					continue
				}

				deviceID := ExtractDeviceID(path)
				if deviceID == "" {
					deviceID = path // Fallback for simple CSV
				}

				// Intern strings
				deviceID = intern.Intern(deviceID)
				signal = intern.Intern(signal)

				stype := InferType(valueStr)
				value := ParseValue(valueStr, stype)

				entry := models.LogEntry{
					DeviceID:   deviceID,
					SignalName: signal,
					Timestamp:  ts,
					Value:      value,
					SignalType: stype,
				}
				entries = append(entries, entry)
				signalKey := entry.DeviceID + "::" + entry.SignalName
				signals[signalKey] = struct{}{}
				devices[entry.DeviceID] = struct{}{}
				
				// Track signal type requirements
				if entry.SignalType == models.SignalTypeInteger {
					if val, ok := entry.Value.(int); ok {
						if val != 0 && val != 1 {
							signalTypeReqs[signalKey] = models.SignalTypeInteger
						} else if signalTypeReqs[signalKey] == "" {
							signalTypeReqs[signalKey] = models.SignalTypeBoolean
						}
					}
				} else if entry.SignalType == models.SignalTypeBoolean {
					if signalTypeReqs[signalKey] == "" {
						signalTypeReqs[signalKey] = models.SignalTypeBoolean
					}
				} else {
					signalTypeReqs[signalKey] = models.SignalTypeString
				}
				continue
			}

			errors = append(errors, &models.ParseError{
				Line:    lineNum,
				Content: line,
				Reason:  "line does not match CSV signal format",
			})
			continue
		}

		tsStr := m[1]
		path := m[2]
		signal := m[3]
		valueStr := m[4]

		ts, err := FastTimestamp(tsStr)
		if err != nil {
			errors = append(errors, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"})
			continue
		}

		deviceID := ExtractDeviceID(path)
		if deviceID == "" {
			deviceID = path
		}

		// Intern strings
		deviceID = intern.Intern(deviceID)
		signal = intern.Intern(signal)

		stype := InferType(valueStr)
		value := ParseValue(valueStr, stype)

		entry := models.LogEntry{
			DeviceID:   deviceID,
			SignalName: signal,
			Timestamp:  ts,
			Value:      value,
			SignalType: stype,
		}
		entries = append(entries, entry)
		signalKey := entry.DeviceID + "::" + entry.SignalName
		signals[signalKey] = struct{}{}
		devices[entry.DeviceID] = struct{}{}
		
		// Track signal type requirements
		if entry.SignalType == models.SignalTypeInteger {
			if val, ok := entry.Value.(int); ok {
				if val != 0 && val != 1 {
					signalTypeReqs[signalKey] = models.SignalTypeInteger
				} else if signalTypeReqs[signalKey] == "" {
					signalTypeReqs[signalKey] = models.SignalTypeBoolean
				}
			}
		} else if entry.SignalType == models.SignalTypeBoolean {
			if signalTypeReqs[signalKey] == "" {
				signalTypeReqs[signalKey] = models.SignalTypeBoolean
			}
		} else {
			signalTypeReqs[signalKey] = models.SignalTypeString
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

	// Final progress update
	if onProgress != nil {
		onProgress(lineNum, bytesRead, totalBytes)
	}
	
	// Resolve signal types: upgrade boolean signals to integer if needed
	for i := range entries {
		signalKey := entries[i].DeviceID + "::" + entries[i].SignalName
		if requiredType, ok := signalTypeReqs[signalKey]; ok {
			if requiredType == models.SignalTypeInteger && entries[i].SignalType == models.SignalTypeBoolean {
				entries[i].SignalType = models.SignalTypeInteger
				if entries[i].Value == true {
					entries[i].Value = 1
				} else {
					entries[i].Value = 0
				}
			}
		}
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
