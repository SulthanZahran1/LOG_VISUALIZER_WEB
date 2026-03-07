package parser

import (
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// STKPLCParser handles STK PLC observable xlsx exports.
// Columns: Machine, Date/Time, SubSystemID, ObservableID, CurrentValue, ValueType
type STKPLCParser struct{}

func NewSTKPLCParser() *STKPLCParser {
	return &STKPLCParser{}
}

func (p *STKPLCParser) Name() string {
	return "stk_plc"
}

func (p *STKPLCParser) CanParse(filePath string) (bool, error) {
	if !isXLSXFile(filePath) {
		return false, nil
	}
	rows, err := xlsxRows(filePath)
	if err != nil || len(rows) < 1 {
		return false, nil
	}
	h := rows[0]
	return len(h) >= 6 &&
		h[2] == "SubSystemID" &&
		h[3] == "ObservableID" &&
		h[4] == "CurrentValue", nil
}

// Column indices (0-based) in the STK PLC xlsx.
const (
	stkPLCColDateTime    = 1
	stkPLCColSubSystemID = 2
	stkPLCColObsID       = 3
	stkPLCColValue       = 4
	stkPLCColValueType   = 5
)

func (p *STKPLCParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *STKPLCParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	rows, err := xlsxRows(filePath)
	if err != nil {
		return nil, nil, err
	}

	store := NewCompactLogStore()
	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	for i, row := range rows {
		if i == 0 {
			continue // skip header
		}
		if len(row) <= stkPLCColValue {
			continue
		}

		ts, err := FastTimestamp(strings.TrimSpace(row[stkPLCColDateTime]))
		if err != nil {
			errors = append(errors, &models.ParseError{
				Line:    i + 1,
				Content: strings.Join(row, "|"),
				Reason:  "invalid timestamp",
			})
			continue
		}

		deviceID := intern.Intern(strings.TrimSpace(row[stkPLCColSubSystemID]))
		signalName := intern.Intern(strings.TrimSpace(row[stkPLCColObsID]))
		valueStr := strings.TrimSpace(row[stkPLCColValue])

		stype := stkPLCMapValueType(row, stkPLCColValueType)
		if stype == "" {
			stype = InferType(valueStr)
		}

		store.AddEntry(&models.LogEntry{
			DeviceID:   deviceID,
			SignalName: signalName,
			Timestamp:  ts,
			Value:      ParseValue(valueStr, stype),
			SignalType: stype,
		})

		if onProgress != nil && i%10000 == 0 {
			onProgress(i, 0, 0)
		}
	}

	store.ResolveSignalTypes()
	return store.ToParsedLog(), errors, nil
}

func (p *STKPLCParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
	rows, err := xlsxRows(filePath)
	if err != nil {
		return nil, err
	}

	errors := make([]*models.ParseError, 0)
	intern := GetGlobalIntern()

	for i, row := range rows {
		if i == 0 {
			continue
		}
		if len(row) <= stkPLCColValue {
			continue
		}

		ts, err := FastTimestamp(strings.TrimSpace(row[stkPLCColDateTime]))
		if err != nil {
			errors = append(errors, &models.ParseError{
				Line:    i + 1,
				Content: strings.Join(row, "|"),
				Reason:  "invalid timestamp",
			})
			continue
		}

		deviceID := intern.Intern(strings.TrimSpace(row[stkPLCColSubSystemID]))
		signalName := intern.Intern(strings.TrimSpace(row[stkPLCColObsID]))
		valueStr := strings.TrimSpace(row[stkPLCColValue])

		stype := stkPLCMapValueType(row, stkPLCColValueType)
		if stype == "" {
			stype = InferType(valueStr)
		}

		store.AddEntry(&models.LogEntry{
			DeviceID:   deviceID,
			SignalName: signalName,
			Timestamp:  ts,
			Value:      ParseValue(valueStr, stype),
			SignalType: stype,
		})

		if onProgress != nil && i%10000 == 0 {
			onProgress(i, 0, 0)
		}
	}

	if onProgress != nil {
		onProgress(len(rows), 0, 0)
	}

	return errors, nil
}

// stkPLCMapValueType reads the ValueType column and returns the corresponding SignalType.
// Returns "" if unknown, so callers can fall back to InferType.
func stkPLCMapValueType(row []string, col int) models.SignalType {
	if col >= len(row) {
		return ""
	}
	switch strings.ToLower(strings.TrimSpace(row[col])) {
	case "boolean":
		return models.SignalTypeBoolean
	case "integer", "int", "long", "short", "byte":
		return models.SignalTypeInteger
	case "string":
		return models.SignalTypeString
	default:
		return ""
	}
}
