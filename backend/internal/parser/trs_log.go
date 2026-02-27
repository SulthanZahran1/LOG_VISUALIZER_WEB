package parser

import (
	"bufio"
	"os"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// TRSLogParser handles TRS backtick-delimited transfer logs.
// Format: Timestamp`TRS`HST`CmdID`Status`Priority`CarrierID`CarrierID2`Source`Dest`CurrLoc`Field12`Field13`Field14`Result`StartTime`EndTime
type TRSLogParser struct{}

func NewTRSLogParser() *TRSLogParser {
	return &TRSLogParser{}
}

func (p *TRSLogParser) Name() string {
	return "trs_log"
}

func (p *TRSLogParser) CanParse(filePath string) (bool, error) {
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
		parts := strings.Split(line, "`")
		if len(parts) >= 15 && parts[1] == "TRS" {
			matched++
		}
	}

	return checked > 0 && float64(matched)/float64(checked) >= 0.6, nil
}

func (p *TRSLogParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *TRSLogParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	fileInfo, _ := file.Stat()
	totalBytes := int64(0)
	if fileInfo != nil {
		totalBytes = fileInfo.Size()
	}

	entries := make([]models.LogEntry, 0, 10000)
	errors := make([]*models.ParseError, 0, 100)
	signals := make(map[string]struct{})
	devices := make(map[string]struct{})
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

		parts := strings.Split(line, "`")
		if len(parts) < 15 {
			continue
		}

		tsStr := strings.TrimSpace(parts[0])
		// Timestamp format: 2025-09-05 00:00:54:956
		// FastTimestamp expects 2025-09-05 00:00:54.956
		tsNormalized := tsStr
		if len(tsStr) > 19 && tsStr[19] == ':' {
			tsNormalized = tsStr[:19] + "." + tsStr[20:]
		}
		
		ts, err := FastTimestamp(tsNormalized)
		if err != nil {
			errors = append(errors, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"})
			continue
		}

		cmdID := strings.TrimSpace(parts[3])
		status := strings.TrimSpace(parts[4])
		carrierID := strings.TrimSpace(parts[6])
		source := strings.TrimSpace(parts[8])
		dest := strings.TrimSpace(parts[9])
		currLoc := strings.TrimSpace(parts[10])
		result := strings.TrimSpace(parts[14])

		intern.Intern(carrierID)
		deviceID := intern.Intern(carrierID)
		devices[deviceID] = struct{}{}

		// We store everything in a single entry with JSON value for structured display
		// Format: CommandID|Status|Source|Dest|CurrLoc|Result
		val := strings.Join([]string{cmdID, status, source, dest, currLoc, result}, "|")
		
		*entries = append(*entries, models.LogEntry{
			DeviceID:   deviceID,
			SignalName: intern.Intern("Transfer"),
			Timestamp:  ts,
			Value:      val,
			SignalType: models.SignalTypeString,
		})
		signals[deviceID+"::Transfer"] = struct{}{}

		if onProgress != nil && lineNum%10000 == 0 {
			onProgress(lineNum, bytesRead, totalBytes)
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

func (p *TRSLogParser) addEntry(entries *[]models.LogEntry, signals map[string]struct{}, deviceID, name string, ts time.Time, val interface{}, stype models.SignalType, intern *StringIntern) {
	name = intern.Intern(name)
	*entries = append(*entries, models.LogEntry{
		DeviceID:   deviceID,
		SignalName: name,
		Timestamp:  ts,
		Value:      val,
		SignalType: stype,
	})
	signals[deviceID+"::"+name] = struct{}{}
}
