package parser

import (
	"os"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

func TestPLCDebugParser(t *testing.T) {
	p := NewPLCDebugParser()
	intern := NewStringIntern()
	line := "2025-09-22 13:00:00.199 [Debug] [SYSTEM/PATH/DEV-123] [INPUT2:I_MOVE_IN] (Boolean) : ON"

	entry, err := p.parseLine(line, 1, intern)
	if err != nil {
		t.Fatalf("Failed to parse line: %v", err)
	}

	if entry.DeviceID != "DEV-123" {
		t.Errorf("Expected DeviceID DEV-123, got %s", entry.DeviceID)
	}
	if entry.SignalName != "I_MOVE_IN" {
		t.Errorf("Expected SignalName I_MOVE_IN, got %s", entry.SignalName)
	}
	if entry.Value != true {
		t.Errorf("Expected Value true, got %v", entry.Value)
	}
	if entry.SignalType != models.SignalTypeBoolean {
		t.Errorf("Expected SignalType boolean, got %s", entry.SignalType)
	}

	// Test full parse to verify TimeRange
	tmpFile := "test_debug.log"
	os.WriteFile(tmpFile, []byte(line), 0644)
	defer os.Remove(tmpFile)

	parsed, _, _ := p.Parse(tmpFile)
	if parsed.TimeRange == nil {
		t.Error("Expected TimeRange to be set")
	}
}

func TestPLCTabParser(t *testing.T) {
        intern := NewStringIntern()
	p := NewPLCTabParser()
	// Format: ts [] path\tsignal\tdirection\tvalue\tblank\tlocation\tflag1\tflag2\tts2
	line := "2025-09-22 13:00:00.199 [] SYSTEM/PATH/DEV-456\tMY_SIGNAL\tIN\t123\t\tLOC\tF1\tF2\t2025-09-22 13:00:00.199"

	entry, err := p.parseLine(line, 1, intern)
	if err != nil {
		t.Fatalf("Failed to parse line: %v", err)
	}

	if entry.DeviceID != "DEV-456" {
		t.Errorf("Expected DeviceID DEV-456, got %s", entry.DeviceID)
	}
	if entry.SignalName != "MY_SIGNAL" {
		t.Errorf("Expected SignalName MY_SIGNAL, got %s", entry.SignalName)
	}
	if entry.Value != int(123) {
		t.Errorf("Expected Value 123, got %v (%T)", entry.Value, entry.Value)
	}
	if entry.SignalType != models.SignalTypeInteger {
		t.Errorf("Expected SignalType integer, got %s", entry.SignalType)
	}

	// Test trimming and TimeRange
	line2 := "2025-09-22 13:00:00.199 [] SYSTEM/PATH/DEV-456\tMY_SIGNAL         \tIN\t123\t\tLOC\tF1\tF2\t2025-09-22 13:00:00.199"
	tmpFile := "test_tab.log"
	os.WriteFile(tmpFile, []byte(line2), 0644)
	defer os.Remove(tmpFile)

	parsed, _, _ := p.Parse(tmpFile)
	if parsed.TimeRange == nil {
		t.Error("Expected TimeRange to be set")
	}
	// String interning trims whitespace and deduplicates
	if parsed.Entries[0].SignalName != "MY_SIGNAL" {
		t.Errorf("Expected interned SignalName 'MY_SIGNAL', got '%s'", parsed.Entries[0].SignalName)
	}
}

func TestMCSLogParser(t *testing.T) {
	p := NewMCSLogParser()
	intern := NewStringIntern()
	line := "2025-12-05 00:00:35.404 [UPDATE=CMD123, CAR-789] [CarrierLoc=B1ACNV13301-120], [Priority=5]"

	entries, err := p.parseLine(line, 1, intern)
	if err != nil {
		t.Fatalf("Failed to parse line: %v", err)
	}

	if len(entries) != 4 { // _Action, _CommandID, CurrentLocation, Priority
		t.Fatalf("Expected 4 entries, got %d", len(entries))
	}

	// Check mapping and carrier ID
	for _, e := range entries {
		if e.DeviceID != "CAR-789" {
			t.Errorf("Expected DeviceID CAR-789, got %s", e.DeviceID)
		}
		if e.SignalName == "CurrentLocation" && e.Value != "B1ACNV13301-120" {
			t.Errorf("Expected CurrentLocation value B1ACNV13301-120, got %v", e.Value)
		}
		if e.SignalName == "Priority" && e.Value != 5 {
			t.Errorf("Expected Priority value 5, got %v", e.Value)
		}
	}
}

func TestCSVSignalParser(t *testing.T) {
	p := NewCSVSignalParser()
	line := "2025-10-21 23:08:27.995,B1ACNV13309-104@D19,B,62"

	// Parse method handles the full file reading, so we test with a temp file or mock reading
	// For simplicity, we can't test internal scanner easily without a file,
	// but we can trust the regex and logic are similar to others.
	// Let's create a temporary file.

	tmpFile := "test_csv.log"
	os.WriteFile(tmpFile, []byte(line), 0644)
	defer os.Remove(tmpFile)

	parsed, errors, err := p.Parse(tmpFile)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if len(errors) > 0 {
		t.Fatalf("Parse errors: %v", errors[0].Reason)
	}

	if len(parsed.Entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(parsed.Entries))
	}

	e := parsed.Entries[0]
	if e.DeviceID != "B1ACNV13309-104" {
		t.Errorf("Expected DeviceID B1ACNV13309-104, got %s", e.DeviceID)
	}
	if e.SignalName != "B" {
		t.Errorf("Expected SignalName B, got %s", e.SignalName)
	}
	if e.Value != 62 {
		t.Errorf("Expected Value 62, got %v", e.Value)
	}

	if parsed.TimeRange == nil {
		t.Error("Expected TimeRange to be set")
	}
}

// Benchmarks for the optimized parsing functions

func BenchmarkFastTimestamp(b *testing.B) {
	ts := "2025-09-22 13:00:00.199"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = FastTimestamp(ts)
	}
}

func BenchmarkFastTimestampStdLib(b *testing.B) {
	ts := "2025-09-22 13:00:00.199"
	layout := "2006-01-02 15:04:05.999999999"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = time.Parse(layout, ts)
	}
}

func BenchmarkExtractDeviceID(b *testing.B) {
	path := "SYSTEM/PATH/DEVICE-123@D19"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = ExtractDeviceID(path)
	}
}

func BenchmarkInferType(b *testing.B) {
	values := []string{"123", "ON", "hello", "0xFF", "-456"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, v := range values {
			_ = InferType(v)
		}
	}
}

func BenchmarkPLCDebugParseLine(b *testing.B) {
	p := NewPLCDebugParser()
	intern := NewStringIntern()
	line := "2025-09-22 13:00:00.199 [Debug] [SYSTEM/PATH/DEV-123] [INPUT2:I_MOVE_IN] (Boolean) : ON"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = p.parseLine(line, 1, intern)
	}
}

func BenchmarkPLCTabParseLine(b *testing.B) {
	p := NewPLCTabParser()
	intern := NewStringIntern()
	line := "2025-09-22 13:00:00.199 [] SYSTEM/PATH/DEV-456\tMY_SIGNAL\tIN\t123\t\tLOC\tF1\tF2\t2025-09-22 13:00:00.199"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = p.parseLine(line, 1, intern)
	}
}
