package parser

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// MCSLogParser handles AMHS/MCS logs.
// Format: "YYYY-MM-DD HH:MM:SS.mmm [ACTION=CommandID, CarrierID] [Key=Value], [Key2=Value2], ..."
type MCSLogParser struct {
	lineRegex   *regexp.Regexp
	kvPairRegex *regexp.Regexp
	booleanKeys map[string]bool
	integerKeys map[string]bool
	stateKeys   map[string]bool
}

func NewMCSLogParser() *MCSLogParser {
	return &MCSLogParser{
		lineRegex:   regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s+\[(ADD|UPDATE|REMOVE)=([^,\]]+)(?:,\s*([^\]]+))?\]\s*(.*)?$`),
		kvPairRegex: regexp.MustCompile(`\[([^=\]]+)=([^\]]*)\]`),
		booleanKeys: map[string]bool{
			"IsBoost": true, "IsMultiJob": true, "IsMultipleDestination": true,
			"IsLocationGroupOrder": true, "IsExecuteCommand": true,
		},
		integerKeys: map[string]bool{
			"Priority": true, "AltCount": true, "AltCount2": true, "WaitCount": true, "CirculationCount": true,
		},
		stateKeys: map[string]bool{
			"TransferState": true, "TransferState2": true, "TransferAbnormalState": true,
			"TransferAbnormalState2": true, "ResultCode": true, "ResultCode2": true, "CommandType": true,
		},
	}
}

func (p *MCSLogParser) Name() string {
	return "mcs_log"
}

func (p *MCSLogParser) CanParse(filePath string) (bool, error) {
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

func (p *MCSLogParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
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

		lineEntries, parseErr := p.parseLine(line, lineNum)
		if parseErr != nil {
			errors = append(errors, parseErr)
			continue
		}

		for _, entry := range lineEntries {
			entries = append(entries, entry)
			signals[fmt.Sprintf("%s::%s", entry.DeviceID, entry.SignalName)] = struct{}{}
			devices[entry.DeviceID] = struct{}{}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}

	return &models.ParsedLog{
		Entries: entries,
		Signals: signals,
		Devices: devices,
	}, errors, nil
}

func (p *MCSLogParser) parseLine(line string, lineNum int) ([]models.LogEntry, *models.ParseError) {
	m := p.lineRegex.FindStringSubmatch(line)
	if m == nil {
		return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "line does not match MCS format"}
	}

	tsStr := m[1]
	action := m[2]
	firstID := strings.TrimSpace(m[3])
	secondID := strings.TrimSpace(m[4])
	kvPairsStr := m[5]

	ts, err := FastTimestamp(tsStr)
	if err != nil {
		// Try with space if FastTimestamp fails due to slightly different format
		ts, err = time.Parse("2006-01-02 15:04:05.999", tsStr)
		if err != nil {
			return nil, &models.ParseError{Line: lineNum, Content: line, Reason: "invalid timestamp"}
		}
	}

	var carrierID string
	var commandID string

	if secondID != "" {
		commandID = firstID
		carrierID = secondID
	} else {
		carrierID = firstID
	}

	deviceID := carrierID
	entries := make([]models.LogEntry, 0)

	// Action signal
	entries = append(entries, models.LogEntry{
		DeviceID:   deviceID,
		SignalName: "_Action",
		Timestamp:  ts,
		Value:      action,
		SignalType: models.SignalTypeString,
	})

	// CommandID signal
	if commandID != "" {
		entries = append(entries, models.LogEntry{
			DeviceID:   deviceID,
			SignalName: "_CommandID",
			Timestamp:  ts,
			Value:      commandID,
			SignalType: models.SignalTypeString,
		})
	}

	// [Key=Value] pairs
	kvMatches := p.kvPairRegex.FindAllStringSubmatch(kvPairsStr, -1)
	for _, match := range kvMatches {
		key := strings.TrimSpace(match[1])
		valueStr := strings.TrimSpace(match[2])

		if key == "" || valueStr == "" || valueStr == "None" {
			continue
		}

		// Normalization (matches Python reference)
		if key == "CarrierLoc" || key == "CarrierLocation" {
			key = "CurrentLocation"
		}

		stype := p.inferTypeForKey(key, valueStr)
		value := p.parseValueForType(valueStr, stype)

		entries = append(entries, models.LogEntry{
			DeviceID:   deviceID,
			SignalName: key,
			Timestamp:  ts,
			Value:      value,
			SignalType: stype,
		})
	}

	return entries, nil
}

func (p *MCSLogParser) inferTypeForKey(key, value string) models.SignalType {
	if p.booleanKeys[key] {
		return models.SignalTypeBoolean
	}
	if p.integerKeys[key] {
		return models.SignalTypeInteger
	}
	if p.stateKeys[key] {
		return models.SignalTypeString
	}

	// Value based inference
	u := strings.ToUpper(value)
	if u == "TRUE" || u == "FALSE" {
		return models.SignalTypeBoolean
	}

	return InferType(value)
}

func (p *MCSLogParser) parseValueForType(value string, stype models.SignalType) interface{} {
	if stype == models.SignalTypeBoolean {
		u := strings.ToUpper(value)
		return u == "TRUE" || u == "1" || u == "YES" || u == "ON"
	}
	return ParseValue(value, stype)
}
