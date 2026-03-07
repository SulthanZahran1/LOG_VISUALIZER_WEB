package parser

import (
	"strings"

	"github.com/plc-visualizer/backend/internal/models"
)

// STKTransferParser handles STK Transfer xlsx exports.
// Columns: Machine, Date/Time, Type, Command, TransferState, Priority,
//
//	CarrierId, CarrierID64, Source, Dest, CraneId, PlcFrom, PlcTo,
//	CarrierLocation, TransferResult, InitTime, ExecutionTime
type STKTransferParser struct{}

func NewSTKTransferParser() *STKTransferParser {
	return &STKTransferParser{}
}

func (p *STKTransferParser) Name() string {
	return "stk_transfer"
}

func (p *STKTransferParser) CanParse(filePath string) (bool, error) {
	if !strings.HasSuffix(strings.ToLower(filePath), ".xlsx") {
		return false, nil
	}
	rows, err := xlsxRows(filePath)
	if err != nil || len(rows) < 1 {
		return false, nil
	}
	h := rows[0]
	return len(h) >= 15 &&
		h[4] == "TransferState" &&
		h[6] == "CarrierId" &&
		h[13] == "CarrierLocation", nil
}

// Column indices (0-based) in the STK Transfer xlsx.
const (
	stkXferColDateTime      = 1
	stkXferColCommand       = 3
	stkXferColTransferState = 4
	stkXferColCarrierId     = 6
	stkXferColSource        = 8
	stkXferColDest          = 9
	stkXferColCraneId       = 10
	stkXferColPlcFrom       = 11
	stkXferColPlcTo         = 12
	stkXferColCarrierLoc    = 13
	stkXferColResult        = 14
)

func (p *STKTransferParser) Parse(filePath string) (*models.ParsedLog, []*models.ParseError, error) {
	return p.ParseWithProgress(filePath, nil)
}

func (p *STKTransferParser) ParseWithProgress(filePath string, onProgress ProgressCallback) (*models.ParsedLog, []*models.ParseError, error) {
	rows, err := xlsxRows(filePath)
	if err != nil {
		return nil, nil, err
	}

	entries := make([]models.LogEntry, 0, len(rows))
	errors := make([]*models.ParseError, 0)
	signals := make(map[string]struct{})
	devices := make(map[string]struct{})
	intern := GetGlobalIntern()

	for i, row := range rows {
		if i == 0 {
			continue // skip header
		}
		if len(row) <= stkXferColResult {
			continue
		}

		ts, err := FastTimestamp(strings.TrimSpace(row[stkXferColDateTime]))
		if err != nil {
			errors = append(errors, &models.ParseError{
				Line:    i + 1,
				Content: strings.Join(row, "|"),
				Reason:  "invalid timestamp",
			})
			continue
		}

		carrierID := strings.TrimSpace(row[stkXferColCarrierId])
		cmdID := strings.TrimSpace(row[stkXferColCommand])
		status := strings.TrimSpace(row[stkXferColTransferState])
		source := p.resolveLocation(strings.TrimSpace(row[stkXferColSource]), row)
		dest := p.resolveLocation(strings.TrimSpace(row[stkXferColDest]), row)
		currLoc := p.resolveCurrentLocation(row)
		result := strings.TrimSpace(row[stkXferColResult])

		deviceID := intern.Intern(carrierID)
		devices[deviceID] = struct{}{}

		val := strings.Join([]string{cmdID, status, source, dest, currLoc, result}, "|")
		entries = append(entries, models.LogEntry{
			DeviceID:   deviceID,
			SignalName: intern.Intern("Transfer"),
			Timestamp:  ts,
			Value:      val,
			SignalType: models.SignalTypeString,
		})
		signals[deviceID+"::Transfer"] = struct{}{}

		if onProgress != nil && i%10000 == 0 {
			onProgress(i, 0, 0)
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

func (p *STKTransferParser) ParseToDuckStore(filePath string, store *DuckStore, onProgress ProgressCallback) ([]*models.ParseError, error) {
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
		if len(row) <= stkXferColResult {
			continue
		}

		ts, err := FastTimestamp(strings.TrimSpace(row[stkXferColDateTime]))
		if err != nil {
			errors = append(errors, &models.ParseError{
				Line:    i + 1,
				Content: strings.Join(row, "|"),
				Reason:  "invalid timestamp",
			})
			continue
		}

		carrierID := strings.TrimSpace(row[stkXferColCarrierId])
		cmdID := strings.TrimSpace(row[stkXferColCommand])
		status := strings.TrimSpace(row[stkXferColTransferState])
		source := p.resolveLocation(strings.TrimSpace(row[stkXferColSource]), row)
		dest := p.resolveLocation(strings.TrimSpace(row[stkXferColDest]), row)
		currLoc := p.resolveCurrentLocation(row)
		result := strings.TrimSpace(row[stkXferColResult])

		deviceID := intern.Intern(carrierID)
		val := strings.Join([]string{cmdID, status, source, dest, currLoc, result}, "|")
		entry := models.LogEntry{
			DeviceID:   deviceID,
			SignalName: intern.Intern("Transfer"),
			Timestamp:  ts,
			Value:      val,
			SignalType: models.SignalTypeString,
		}
		store.AddEntry(&entry)

		if onProgress != nil && i%10000 == 0 {
			onProgress(i, 0, 0)
		}
	}

	if onProgress != nil {
		onProgress(len(rows), 0, 0)
	}

	return errors, nil
}

// resolveLocation mirrors TRS parser logic: fall back to PlcFrom/PlcTo rack IDs when primary is empty or "SN0".
func (p *STKTransferParser) resolveLocation(primary string, row []string) string {
	if primary != "" && !strings.EqualFold(primary, "SN0") {
		return primary
	}
	for _, idx := range []int{stkXferColPlcFrom, stkXferColPlcTo} {
		if idx < len(row) {
			if rackID := extractTRSRackID(strings.TrimSpace(row[idx])); rackID != "" {
				return rackID
			}
		}
	}
	return primary
}

// resolveCurrentLocation mirrors TRS parser logic: prefer CarrierLocation, fall back to CraneId.
func (p *STKTransferParser) resolveCurrentLocation(row []string) string {
	for _, idx := range []int{stkXferColCarrierLoc, stkXferColCraneId} {
		if idx < len(row) {
			if v := strings.TrimSpace(row[idx]); v != "" {
				return v
			}
		}
	}
	return ""
}
