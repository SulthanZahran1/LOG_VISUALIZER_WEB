package parser

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseMapXML(t *testing.T) {
	// Create a temporary test map file
	content := `<?xml version="1.0" ?>
<ConveyorMap version="1.0">
  <Object name="Belt_01" type="SmartFactory.SmartCIM.GUI.Widgets.WidgetBelt">
    <Size>120, 40</Size>
    <Location>20, 100</Location>
    <UnitId>B1ACNV13301-104</UnitId>
    <Text>Infeed 1</Text>
  </Object>
  <Object name="Arrow_01" type="SmartFactory.SmartCIM.GUI.Widgets.WidgetArrow">
    <Size>30, 20</Size>
    <Location>135, 110</Location>
    <FlowDirection>Angle_90</FlowDirection>
  </Object>
</ConveyorMap>`

	tmpDir, err := os.MkdirTemp("", "map_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	path := filepath.Join(tmpDir, "test_map.xml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	layout, err := ParseMapXML(path)
	if err != nil {
		t.Fatalf("ParseMapXML failed: %v", err)
	}

	if layout.Version != "1.0" {
		t.Errorf("expected version 1.0, got %s", layout.Version)
	}

	if len(layout.Objects) != 2 {
		t.Errorf("expected 2 objects, got %d", len(layout.Objects))
	}

	belt, ok := layout.Objects["Belt_01"]
	if !ok {
		t.Fatal("Belt_01 not found")
	}
	if belt.Type != "SmartFactory.SmartCIM.GUI.Widgets.WidgetBelt" {
		t.Errorf("unexpected belt type: %s", belt.Type)
	}
	if belt.Location != "20, 100" {
		t.Errorf("unexpected belt location: %s", belt.Location)
	}
	if belt.UnitId != "B1ACNV13301-104" {
		t.Errorf("unexpected belt unitId: %s", belt.UnitId)
	}

	arrow, ok := layout.Objects["Arrow_01"]
	if !ok {
		t.Fatal("Arrow_01 not found")
	}
	if arrow.FlowDirection != "Angle_90" {
		t.Errorf("unexpected arrow flowDirection: %s", arrow.FlowDirection)
	}
}
