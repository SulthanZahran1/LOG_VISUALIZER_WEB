// parsers_test.go - Tests for PLC Debug, CSV, and MCS log parsers
package parser

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

// createTestFile creates a temporary file with given content
func createTestFile(t *testing.T, content string) string {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "test.log")
	
	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	
	return filePath
}

// createTestFileWithName creates a temporary file with a specific name
func createTestFileWithName(t *testing.T, name string, content string) string {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, name)
	
	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	
	return filePath
}

// ============ PLC Debug Parser Tests ============

func TestPLCDebugParser_CanParse(t *testing.T) {
	parser := NewPLCDebugParser()
	
	t.Run("valid plc debug format", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [DEBUG] [/PLC/Device2] [CAT:Signal2] (int) : 42
2024-01-15 10:30:47.345 [INFO] [/PLC/Device1] [CATEGORY:Signal1] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true for valid PLC debug format")
		}
	})
	
	t.Run("invalid format", func(t *testing.T) {
		content := `This is not a valid log line
Just some random text
Another invalid line`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for invalid format")
		}
	})
	
	t.Run("mixed valid and invalid lines", func(t *testing.T) {
		// 60% valid lines should pass
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
Invalid line here
2024-01-15 10:30:46.234 [DEBUG] [/PLC/Device2] [CAT:Signal2] (int) : 42
Another bad line
2024-01-15 10:30:47.345 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true when 60% of lines match")
		}
	})
	
	t.Run("handles UTF-8 BOM", func(t *testing.T) {
		content := "\xEF\xBB\xBF2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE"
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to handle UTF-8 BOM")
		}
	})
	
	t.Run("empty file", func(t *testing.T) {
		filePath := createTestFile(t, "")
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for empty file")
		}
	})
}

func TestPLCDebugParser_Parse(t *testing.T) {
	parser := NewPLCDebugParser()
	
	t.Run("parses boolean values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:MotorRunning] (bool) : TRUE
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CATEGORY:MotorRunning] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		entry1 := parsedLog.Entries[0]
		if entry1.Value != true {
			t.Errorf("Expected first value TRUE, got %v", entry1.Value)
		}
		if entry1.SignalType != models.SignalTypeBoolean {
			t.Errorf("Expected boolean type, got %v", entry1.SignalType)
		}
		
		entry2 := parsedLog.Entries[1]
		if entry2.Value != false {
			t.Errorf("Expected second value FALSE, got %v", entry2.Value)
		}
	})
	
	t.Run("parses integer values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Counter] (int) : 42
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CATEGORY:Counter] (int) : -100`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		if parsedLog.Entries[0].Value != 42 {
			t.Errorf("Expected value 42, got %v", parsedLog.Entries[0].Value)
		}
		if parsedLog.Entries[1].Value != -100 {
			t.Errorf("Expected value -100, got %v", parsedLog.Entries[1].Value)
		}
	})
	
	t.Run("parses float values as strings", func(t *testing.T) {
		// Note: The PLC parser treats 'float' dtype as string since SignalType only has
		// boolean, integer, and string. The raw value is preserved.
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Temperature] (float) : 23.5
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CATEGORY:Pressure] (float) : 101.325`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		// Float values are stored as strings (SignalTypeString)
		val, ok := parsedLog.Entries[0].Value.(string)
		if !ok {
			t.Fatalf("Expected string value for float, got %T", parsedLog.Entries[0].Value)
		}
		if val != "23.5" {
			t.Errorf("Expected value '23.5', got %v", val)
		}
		if parsedLog.Entries[0].SignalType != models.SignalTypeString {
			t.Errorf("Expected string type for float values, got %v", parsedLog.Entries[0].SignalType)
		}
	})
	
	t.Run("parses string values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CATEGORY:Status] (string) : Running
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CATEGORY:Mode] (string) : Auto`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		if parsedLog.Entries[0].Value != "Running" {
			t.Errorf("Expected value 'Running', got %v", parsedLog.Entries[0].Value)
		}
		if parsedLog.Entries[0].SignalType != models.SignalTypeString {
			t.Errorf("Expected string type, got %v", parsedLog.Entries[0].SignalType)
		}
	})
	
	t.Run("extracts device ID from path", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Line1/StationA] [CAT:Signal1] (bool) : TRUE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(parsedLog.Entries) != 1 {
			t.Fatalf("Expected 1 entry, got %d", len(parsedLog.Entries))
		}
		
		// DeviceID should be extracted from path
		if parsedLog.Entries[0].DeviceID == "" {
			t.Error("Expected DeviceID to be extracted")
		}
	})
	
	t.Run("extracts category", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [SYSTEM:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [ALARM:Signal2] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if parsedLog.Entries[0].Category != "SYSTEM" {
			t.Errorf("Expected category 'SYSTEM', got %v", parsedLog.Entries[0].Category)
		}
		if parsedLog.Entries[1].Category != "ALARM" {
			t.Errorf("Expected category 'ALARM', got %v", parsedLog.Entries[1].Category)
		}
	})
	
	t.Run("tracks signals and devices", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [INFO] [/PLC/Device2] [CAT:Signal2] (int) : 42
2024-01-15 10:30:47.345 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		// Should track 2 unique signals
		if len(parsedLog.Signals) != 2 {
			t.Errorf("Expected 2 unique signals, got %d", len(parsedLog.Signals))
		}
		
		// Should track 2 unique devices
		if len(parsedLog.Devices) != 2 {
			t.Errorf("Expected 2 unique devices, got %d", len(parsedLog.Devices))
		}
	})
	
	t.Run("calculates time range", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : FALSE
2024-01-15 10:30:47.345 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if parsedLog.TimeRange == nil {
			t.Fatal("Expected TimeRange to be set")
		}
		
		expectedStart := time.Date(2024, 1, 15, 10, 30, 45, 123000000, time.UTC)
		expectedEnd := time.Date(2024, 1, 15, 10, 30, 47, 345000000, time.UTC)
		
		if !parsedLog.TimeRange.Start.Equal(expectedStart) {
			t.Errorf("Expected start %v, got %v", expectedStart, parsedLog.TimeRange.Start)
		}
		if !parsedLog.TimeRange.End.Equal(expectedEnd) {
			t.Errorf("Expected end %v, got %v", expectedEnd, parsedLog.TimeRange.End)
		}
	})
	
	t.Run("reports parse errors for invalid lines", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
This is an invalid line
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if len(errors) != 1 {
			t.Errorf("Expected 1 parse error, got %d", len(errors))
		}
		
		// Should still parse valid lines
		if len(parsedLog.Entries) != 2 {
			t.Errorf("Expected 2 valid entries, got %d", len(parsedLog.Entries))
		}
	})
	
	t.Run("handles empty file", func(t *testing.T) {
		filePath := createTestFile(t, "")
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 0 {
			t.Errorf("Expected 0 entries, got %d", len(parsedLog.Entries))
		}
		if parsedLog.TimeRange != nil {
			t.Error("Expected nil TimeRange for empty file")
		}
	})
}

func TestPLCDebugParser_Name(t *testing.T) {
	parser := NewPLCDebugParser()
	if parser.Name() != "plc_debug" {
		t.Errorf("Expected name 'plc_debug', got %v", parser.Name())
	}
}

// ============ CSV Parser Tests ============

func TestCSVParser_CanParse(t *testing.T) {
	parser := NewCSVSignalParser()
	
	t.Run("valid csv format", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Signal1, TRUE
2024-01-15 10:30:46.234, Device2, Signal2, 42
2024-01-15 10:30:47.345, Device1, Signal1, FALSE`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true for valid CSV format")
		}
	})
	
	t.Run("invalid format", func(t *testing.T) {
		content := `Not a CSV line
Another invalid line`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for invalid format")
		}
	})
	
	t.Run("empty file", func(t *testing.T) {
		filePath := createTestFile(t, "")
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for empty file")
		}
	})
}

func TestCSVParser_Parse(t *testing.T) {
	parser := NewCSVSignalParser()
	
	t.Run("parses boolean values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, MotorRunning, TRUE
2024-01-15 10:30:46.234, Device1, MotorRunning, FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d: %+v", len(errors), errors)
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		if parsedLog.Entries[0].Value != true {
			t.Errorf("Expected first value TRUE, got %v", parsedLog.Entries[0].Value)
		}
		if parsedLog.Entries[1].Value != false {
			t.Errorf("Expected second value FALSE, got %v", parsedLog.Entries[1].Value)
		}
	})
	
	t.Run("parses integer values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Counter, 42
2024-01-15 10:30:46.234, Device1, Counter, -100`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}
		
		if parsedLog.Entries[0].Value != 42 {
			t.Errorf("Expected value 42, got %v", parsedLog.Entries[0].Value)
		}
		if parsedLog.Entries[0].SignalType != models.SignalTypeInteger {
			t.Errorf("Expected integer type, got %v", parsedLog.Entries[0].SignalType)
		}
	})
	
	t.Run("parses float values as strings", func(t *testing.T) {
		// CSV parser uses InferType which treats floats as strings
		content := `2024-01-15 10:30:45.123, Device1, Temperature, 23.5
2024-01-15 10:30:46.234, Device1, Pressure, 101.325`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		
		// CSV parser stores floats as strings (InferType doesn't detect floats)
		val, ok := parsedLog.Entries[0].Value.(string)
		if !ok {
			t.Fatalf("Expected string for float value, got %T", parsedLog.Entries[0].Value)
		}
		if val != "23.5" {
			t.Errorf("Expected '23.5', got %v", val)
		}
		if parsedLog.Entries[0].SignalType != models.SignalTypeString {
			t.Errorf("Expected string type, got %v", parsedLog.Entries[0].SignalType)
		}
	})
	
	t.Run("parses string values", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Status, Running
2024-01-15 10:30:46.234, Device1, Mode, Auto`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		
		if parsedLog.Entries[0].Value != "Running" {
			t.Errorf("Expected 'Running', got %v", parsedLog.Entries[0].Value)
		}
		if parsedLog.Entries[0].SignalType != models.SignalTypeString {
			t.Errorf("Expected string type, got %v", parsedLog.Entries[0].SignalType)
		}
	})
	
	t.Run("extracts device ID from path", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, /PLC/Line1/StationA, Signal1, TRUE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(parsedLog.Entries) != 1 {
			t.Fatalf("Expected 1 entry, got %d", len(parsedLog.Entries))
		}
		
		if parsedLog.Entries[0].DeviceID == "" {
			t.Error("Expected DeviceID to be extracted")
		}
	})
	
	t.Run("handles simple device ID", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Signal1, TRUE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if parsedLog.Entries[0].DeviceID != "Device1" {
			t.Errorf("Expected DeviceID 'Device1', got %v", parsedLog.Entries[0].DeviceID)
		}
	})
	
	t.Run("tracks signals and devices", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Signal1, TRUE
2024-01-15 10:30:46.234, Device2, Signal2, 42
2024-01-15 10:30:47.345, Device1, Signal1, FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if len(parsedLog.Signals) != 2 {
			t.Errorf("Expected 2 signals, got %d", len(parsedLog.Signals))
		}
		if len(parsedLog.Devices) != 2 {
			t.Errorf("Expected 2 devices, got %d", len(parsedLog.Devices))
		}
	})
	
	t.Run("calculates time range", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123, Device1, Signal1, TRUE
2024-01-15 10:30:47.345, Device1, Signal1, FALSE`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if parsedLog.TimeRange == nil {
			t.Fatal("Expected TimeRange to be set")
		}
		
		expectedStart := time.Date(2024, 1, 15, 10, 30, 45, 123000000, time.UTC)
		if !parsedLog.TimeRange.Start.Equal(expectedStart) {
			t.Errorf("Expected start %v, got %v", expectedStart, parsedLog.TimeRange.Start)
		}
	})
	
	t.Run("handles empty file", func(t *testing.T) {
		filePath := createTestFile(t, "")
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 0 {
			t.Errorf("Expected 0 entries, got %d", len(parsedLog.Entries))
		}
	})
}

func TestCSVParser_Name(t *testing.T) {
	parser := NewCSVSignalParser()
	if parser.Name() != "csv_signal" {
		t.Errorf("Expected name 'csv_signal', got %v", parser.Name())
	}
}

// ============ MCS Parser Tests ============

func TestMCSParser_CanParse(t *testing.T) {
	parser := NewMCSLogParser()
	
	t.Run("valid mcs format", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [TransferState=ACTIVE]
2024-01-15 10:30:46.234 [UPDATE=CMD001] [TransferState=COMPLETED]
2024-01-15 10:30:47.345 [REMOVE=CMD001]`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true for valid MCS format")
		}
	})
	
	t.Run("invalid format", func(t *testing.T) {
		content := `Not an MCS log line
Just random text`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for invalid format")
		}
	})
	
	t.Run("mixed valid and invalid", func(t *testing.T) {
		// 60% valid lines should pass
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [TransferState=ACTIVE]
Invalid line
2024-01-15 10:30:46.234 [UPDATE=CMD001] [TransferState=COMPLETED]
Another bad line
2024-01-15 10:30:47.345 [REMOVE=CMD001]`
		
		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true when 60% of lines match")
		}
	})
}

func TestMCSParser_Parse(t *testing.T) {
	parser := NewMCSLogParser()
	
	t.Run("parses ADD command", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [TransferState=ACTIVE] [Priority=1]`
		
		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) == 0 {
			t.Fatal("Expected entries to be parsed")
		}
		
		// Check that entries were created for key-value pairs
		foundTransferState := false
		for _, entry := range parsedLog.Entries {
			if entry.SignalName == "TransferState" {
				foundTransferState = true
				if entry.Value != "ACTIVE" {
					t.Errorf("Expected TransferState=ACTIVE, got %v", entry.Value)
				}
			}
		}
		if !foundTransferState {
			t.Error("Expected TransferState entry")
		}
	})
	
	t.Run("parses UPDATE command", func(t *testing.T) {
		content := `2024-01-15 10:30:46.234 [UPDATE=CMD001] [TransferState=COMPLETED] [ResultCode=0]`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(parsedLog.Entries) == 0 {
			t.Fatal("Expected entries to be parsed")
		}
	})
	
	t.Run("parses REMOVE command", func(t *testing.T) {
		content := `2024-01-15 10:30:47.345 [REMOVE=CMD001]`
		
		filePath := createTestFile(t, content)
		_, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		// REMOVE may create entries or not depending on implementation
		// Just verify it doesn't error
	})
	
	t.Run("parses boolean keys", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [IsBoost=true] [IsMultiJob=false]`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		// Look for boolean entries
		for _, entry := range parsedLog.Entries {
			if entry.SignalName == "IsBoost" {
				if entry.Value != true && entry.Value != "true" {
					t.Errorf("Expected IsBoost=true, got %v", entry.Value)
				}
			}
		}
	})
	
	t.Run("parses integer keys", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [Priority=5] [AltCount=2]`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		// Look for integer entries
		for _, entry := range parsedLog.Entries {
			if entry.SignalName == "Priority" {
				// Priority should be parsed as integer
				if entry.SignalType != models.SignalTypeInteger {
					t.Errorf("Expected Priority to be integer type, got %v", entry.SignalType)
				}
			}
		}
	})
	
	t.Run("tracks signals and devices", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [TransferState=ACTIVE]
2024-01-15 10:30:46.234 [ADD=CMD002, CARR002] [TransferState=PENDING]`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		// Should have some signals tracked
		if len(parsedLog.Signals) == 0 {
			t.Error("Expected signals to be tracked")
		}
		if len(parsedLog.Devices) == 0 {
			t.Error("Expected devices to be tracked")
		}
	})
	
	t.Run("calculates time range", func(t *testing.T) {
		content := `2024-01-15 10:30:45.123 [ADD=CMD001, CARR001] [TransferState=ACTIVE]
2024-01-15 10:30:47.345 [UPDATE=CMD001] [TransferState=COMPLETED]`
		
		filePath := createTestFile(t, content)
		parsedLog, _, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		
		if parsedLog.TimeRange == nil {
			t.Fatal("Expected TimeRange to be set")
		}
	})
	
	t.Run("handles empty file", func(t *testing.T) {
		filePath := createTestFile(t, "")
		parsedLog, errors, err := parser.Parse(filePath)
		
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Errorf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 0 {
			t.Errorf("Expected 0 entries, got %d", len(parsedLog.Entries))
		}
	})
}

func TestMCSParser_Name(t *testing.T) {
	parser := NewMCSLogParser()
	if parser.Name() != "mcs_log" {
		t.Errorf("Expected name 'mcs_log', got %v", parser.Name())
	}
}

// ============ Parser Registry Tests ============

func TestParserRegistry(t *testing.T) {
	registry := NewRegistry()
	
	t.Run("registers default parsers", func(t *testing.T) {
		// Check that we can get parsers by name
		plcParser, err := registry.GetParserByName("plc_debug")
		if err != nil {
			t.Errorf("Expected registry to have PLC debug parser: %v", err)
		}
		if plcParser == nil {
			t.Error("Expected PLC parser to not be nil")
		}
		
		csvParser, err := registry.GetParserByName("csv_signal")
		if err != nil {
			t.Errorf("Expected registry to have CSV parser: %v", err)
		}
		if csvParser == nil {
			t.Error("Expected CSV parser to not be nil")
		}
		
		mcsParser, err := registry.GetParserByName("mcs_log")
		if err != nil {
			t.Errorf("Expected registry to have MCS parser: %v", err)
		}
		if mcsParser == nil {
			t.Error("Expected MCS parser to not be nil")
		}
	})
	
	t.Run("finds parser by format", func(t *testing.T) {
		// Create a PLC debug format file
		content := `2024-01-15 10:30:45.123 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
2024-01-15 10:30:46.234 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : FALSE`
		
		filePath := createTestFile(t, content)
		parser, err := registry.FindParser(filePath)
		
		if err != nil {
			t.Fatalf("FindParser failed: %v", err)
		}
		if parser == nil {
			t.Fatal("Expected parser to be found")
		}
		if parser.Name() != "plc_debug" {
			t.Errorf("Expected plc_debug parser, got %v", parser.Name())
		}
	})
	
	t.Run("returns error for unknown format", func(t *testing.T) {
		content := `Not a valid log format
Just some random text that doesn't match any parser`
		
		filePath := createTestFile(t, content)
		parser, err := registry.FindParser(filePath)
		
		if err == nil {
			t.Error("Expected error for unknown format")
		}
		if parser != nil {
			t.Error("Expected nil parser for unknown format")
		}
	})
	
	t.Run("registers custom parser", func(t *testing.T) {
		customParser := NewPLCDebugParser() // Using existing as "custom"
		registry.Register(customParser)
		
		// Should still be able to find it
		found, err := registry.GetParserByName("plc_debug")
		if err != nil {
			t.Errorf("Expected to find parser after registration: %v", err)
		}
		if found == nil {
			t.Error("Expected to find registered parser")
		}
	})
}

// ============ Value Parsing Tests ============

func TestParseValue(t *testing.T) {
	tests := []struct {
		input    string
		valType  models.SignalType
		expected interface{}
	}{
		{"TRUE", models.SignalTypeBoolean, true},
		{"true", models.SignalTypeBoolean, true},
		{"FALSE", models.SignalTypeBoolean, false},
		{"false", models.SignalTypeBoolean, false},
		{"ON", models.SignalTypeBoolean, true},
		{"OFF", models.SignalTypeBoolean, false},
		// Note: "1" and "0" are intentionally NOT converted to boolean
		// They are treated as integers to avoid misclassifying integer signals
		{"1", models.SignalTypeInteger, 1},
		{"0", models.SignalTypeInteger, 0},
		{"42", models.SignalTypeInteger, 42},
		{"-100", models.SignalTypeInteger, -100},
		{"3.14", models.SignalTypeString, "3.14"}, // Floats stored as strings for string type
		{"hello", models.SignalTypeString, "hello"},
	}
	
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := ParseValue(tt.input, tt.valType)
			if result != tt.expected {
				t.Errorf("ParseValue(%q, %v) = %v, expected %v", tt.input, tt.valType, result, tt.expected)
			}
		})
	}
}

func TestInferType(t *testing.T) {
	tests := []struct {
		input    string
		expected models.SignalType
	}{
		{"TRUE", models.SignalTypeBoolean},
		{"true", models.SignalTypeBoolean},
		{"FALSE", models.SignalTypeBoolean},
		{"false", models.SignalTypeBoolean},
		{"ON", models.SignalTypeBoolean},
		{"OFF", models.SignalTypeBoolean},
		{"YES", models.SignalTypeBoolean},
		{"NO", models.SignalTypeBoolean},
		// Note: "0" and "1" are intentionally inferred as integers
		// to avoid misclassifying integer signals
		{"1", models.SignalTypeInteger},
		{"0", models.SignalTypeInteger},
		{"42", models.SignalTypeInteger},
		{"-100", models.SignalTypeInteger},
		{"3.14", models.SignalTypeString}, // Floats treated as strings
		{"hello", models.SignalTypeString},
		{"", models.SignalTypeString},
	}
	
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := InferType(tt.input)
			if result != tt.expected {
				t.Errorf("InferType(%q) = %v, expected %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestFastTimestamp(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Time
		wantErr  bool
	}{
		{
			"2024-01-15 10:30:45.123",
			time.Date(2024, 1, 15, 10, 30, 45, 123000000, time.UTC),
			false,
		},
		{
			"2024-01-15 10:30:45",
			time.Date(2024, 1, 15, 10, 30, 45, 0, time.UTC),
			false,
		},
		{
			"invalid",
			time.Time{},
			true,
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, err := FastTimestamp(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Error("Expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}
			if !result.Equal(tt.expected) {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}
