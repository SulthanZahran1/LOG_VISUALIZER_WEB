package parser

import (
	"testing"

	"github.com/plc-visualizer/backend/internal/models"
)

func TestObservableParser_Name(t *testing.T) {
	parser := NewObservableLogParser()
	if parser.Name() != "observable_log" {
		t.Errorf("Expected name 'observable_log', got %v", parser.Name())
	}
}

func TestObservableParser_CanParse(t *testing.T) {
	parser := NewObservableLogParser()

	t.Run("valid observable format", func(t *testing.T) {
		content := `date  time  status  variables device-id datatype  tag
2026-02-19 00:02:10:955` + "`" + `OBSERVABLE` + "`" + `CIM WRITE>>> TRANSFER_REQ` + "`" + `B1ASTO15203-102` + "`" + `Boolean` + "`" + `False` + "`" + `True` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=TransferRequest
2026-02-19 00:02:11:624` + "`" + `OBSERVABLE` + "`" + `CIM READ <<< EQUIPMENT_STATE` + "`" + `B1ASTO15203-102` + "`" + `Short` + "`" + `2` + "`" + `3` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=EquipmentState`

		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if !canParse {
			t.Error("Expected CanParse to return true for observable format")
		}
	})

	t.Run("invalid format", func(t *testing.T) {
		content := `2026-02-19 00:02:10.955 [INFO] [/PLC/Device1] [CAT:Signal1] (bool) : TRUE
random text line`

		filePath := createTestFile(t, content)
		canParse, err := parser.CanParse(filePath)
		if err != nil {
			t.Fatalf("CanParse failed: %v", err)
		}
		if canParse {
			t.Error("Expected CanParse to return false for non-observable format")
		}
	})
}

func TestObservableParser_Parse(t *testing.T) {
	parser := NewObservableLogParser()

	t.Run("parses boolean and integer values", func(t *testing.T) {
		content := `date  time  status  variables device-id datatype  tag
2026-02-19 00:02:10:955` + "`" + `OBSERVABLE` + "`" + `CIM WRITE>>> TRANSFER_REQ` + "`" + `B1ASTO15203-102` + "`" + `Boolean` + "`" + `False` + "`" + `True` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=TransferRequest
2026-02-19 00:02:11:624` + "`" + `OBSERVABLE` + "`" + `CIM READ <<< EQUIPMENT_STATE` + "`" + `B1ASTO15203-102` + "`" + `Short` + "`" + `2` + "`" + `3` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=EquipmentState`

		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Fatalf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 2 {
			t.Fatalf("Expected 2 entries, got %d", len(parsedLog.Entries))
		}

		first := parsedLog.Entries[0]
		if first.DeviceID != "B1ASTO15203-102" {
			t.Errorf("Expected device B1ASTO15203-102, got %s", first.DeviceID)
		}
		if first.SignalName != "TRANSFER_REQ" {
			t.Errorf("Expected signal TRANSFER_REQ, got %s", first.SignalName)
		}
		if first.SignalType != models.SignalTypeBoolean {
			t.Errorf("Expected boolean type, got %v", first.SignalType)
		}
		if first.Value != true {
			t.Errorf("Expected value true, got %v", first.Value)
		}

		second := parsedLog.Entries[1]
		if second.SignalName != "EQUIPMENT_STATE" {
			t.Errorf("Expected signal EQUIPMENT_STATE, got %s", second.SignalName)
		}
		if second.SignalType != models.SignalTypeInteger {
			t.Errorf("Expected integer type, got %v", second.SignalType)
		}
		if second.Value != 3 {
			t.Errorf("Expected value 3, got %v", second.Value)
		}

		if parsedLog.TimeRange == nil {
			t.Fatal("Expected TimeRange to be set")
		}
	})

	t.Run("falls back to old value when new value is empty", func(t *testing.T) {
		content := `date  time  status  variables device-id datatype  tag
2026-02-19 00:02:10:955` + "`" + `OBSERVABLE` + "`" + `CIM READ <<< JOB_READY` + "`" + `B1ASTO15203-102` + "`" + `Boolean` + "`" + `True` + "`" + `` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=JobReady`

		filePath := createTestFile(t, content)
		parsedLog, errors, err := parser.Parse(filePath)
		if err != nil {
			t.Fatalf("Parse failed: %v", err)
		}
		if len(errors) != 0 {
			t.Fatalf("Expected 0 errors, got %d", len(errors))
		}
		if len(parsedLog.Entries) != 1 {
			t.Fatalf("Expected 1 entry, got %d", len(parsedLog.Entries))
		}

		entry := parsedLog.Entries[0]
		if entry.SignalType != models.SignalTypeBoolean {
			t.Errorf("Expected boolean type, got %v", entry.SignalType)
		}
		if entry.Value != true {
			t.Errorf("Expected fallback value true, got %v", entry.Value)
		}
	})
}

func TestParserRegistry_FindsObservableFormat(t *testing.T) {
	registry := NewRegistry()
	content := `date  time  status  variables device-id datatype  tag
2026-02-19 00:02:10:955` + "`" + `OBSERVABLE` + "`" + `CIM WRITE>>> TRANSFER_REQ` + "`" + `B1ASTO15203-102` + "`" + `Boolean` + "`" + `False` + "`" + `True` + "`" + `1` + "`" + `OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=TransferRequest`

	filePath := createTestFileWithName(t, "example-observable.log", content)
	found, err := registry.FindParser(filePath)
	if err != nil {
		t.Fatalf("FindParser failed: %v", err)
	}
	if found == nil {
		t.Fatal("Expected parser to be found")
	}
	if found.Name() != "observable_log" {
		t.Fatalf("Expected observable_log parser, got %s", found.Name())
	}
}
