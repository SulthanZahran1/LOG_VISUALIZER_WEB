package parser

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPLCTabParser_MapViewerLog(t *testing.T) {
	// Test parsing example_map_viewer.log format
	content := `2026-02-05 00:00:00.026 [] B1ACNV13301-596	I_BUFFER_STATUS            	IN      	0		CNV_202:7	T	T	2026-02-05 00:00:00.026
2026-02-05 00:00:00.072 [] B1ACNV13301-102	I_BUFFER_STATUS            	IN      	0		CNV_200:5	T	T	2026-02-05 00:00:00.072	
2026-02-05 00:00:00.072 [] B1ACNV13301-108	I_MOVE_OK                    	IN      	True		CNV_200:5	T	T	2026-02-05 00:00:00.072	
2026-02-05 00:00:00.827 [] B1ACNV13301-103	I_LEVEL1_TRAY_EXIST          	IN      	True		CNV_200:5	T	T	2026-02-05 00:00:00.827	
2026-02-05 00:00:00.827 [] B1ACNV13301-103	I_BUFFER_STATUS              	IN      	1		CNV_200:5	T	T	2026-02-05 00:00:00.827	`

	tmpDir, err := os.MkdirTemp("", "plc_tab_map_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	path := filepath.Join(tmpDir, "test_map.log")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	parser := NewPLCTabParser()

	// Test CanParse
	canParse, err := parser.CanParse(path)
	if err != nil {
		t.Fatalf("CanParse failed: %v", err)
	}
	if !canParse {
		t.Fatal("CanParse should return true for map viewer log format")
	}

	// Test Parse
	result, errors, err := parser.Parse(path)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if len(errors) > 0 {
		t.Logf("Parse errors: %v", errors)
	}

	// Should have 5 entries
	if len(result.Entries) != 5 {
		t.Errorf("expected 5 entries, got %d", len(result.Entries))
	}

	// Check first entry
	if len(result.Entries) > 0 {
		entry := result.Entries[0]
		if entry.DeviceID != "B1ACNV13301-596" {
			t.Errorf("expected device ID B1ACNV13301-596, got %s", entry.DeviceID)
		}
		if entry.SignalName != "I_BUFFER_STATUS" {
			t.Errorf("expected signal I_BUFFER_STATUS, got %s", entry.SignalName)
		}
		// Value should be parsed as integer 0, not string "0"
		if entry.Value != 0 {
			t.Errorf("expected value 0 (int), got %v (type: %T)", entry.Value, entry.Value)
		}
	}

	// Check entry with True value
	if len(result.Entries) > 2 {
		entry := result.Entries[2]
		if entry.DeviceID != "B1ACNV13301-108" {
			t.Errorf("expected device ID B1ACNV13301-108, got %s", entry.DeviceID)
		}
		if entry.SignalName != "I_MOVE_OK" {
			t.Errorf("expected signal I_MOVE_OK, got %s", entry.SignalName)
		}
		if entry.Value != true {
			t.Errorf("expected value true, got %v", entry.Value)
		}
	}

	// Check devices are extracted
	if len(result.Devices) == 0 {
		t.Error("expected at least one device")
	}

	// Check signals are extracted
	if len(result.Signals) == 0 {
		t.Error("expected at least one signal")
	}

	t.Logf("Devices: %v", result.Devices)
	t.Logf("Signals: %v", result.Signals)
}

// Test with actual example_map_viewer.log file if it exists
func TestPLCTabParser_RealMapViewerLog(t *testing.T) {
	path := "../../../example_map_viewer.log"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skip("example_map_viewer.log not found, skipping")
	}

	parser := NewPLCTabParser()

	// Test CanParse
	canParse, err := parser.CanParse(path)
	if err != nil {
		t.Fatalf("CanParse failed: %v", err)
	}
	if !canParse {
		t.Fatal("CanParse should return true for example_map_viewer.log")
	}

	// Test Parse
	result, errors, err := parser.Parse(path)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if len(errors) > 0 {
		t.Logf("Parse errors (%d): %v", len(errors), errors)
	}

	t.Logf("Parsed %d entries", len(result.Entries))
	t.Logf("Devices (%d): %v", len(result.Devices), result.Devices)
	t.Logf("Signals (%d): %v", len(result.Signals), result.Signals)

	if len(result.Entries) == 0 {
		t.Error("expected at least one entry")
	}
}
