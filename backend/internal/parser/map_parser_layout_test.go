package parser

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseMapXML_LayoutDesignerRoot(t *testing.T) {
	// Test the LayoutDesignerControl format (common in .NET WinForms layouts)
	content := `<?xml version="1.0" ?>
<Object type="SmartFactory.SmartCIM.Modeler.Forms.FormLayouts.LayoutDesignerControl, SmartFactory.SmartCIM.Modeler, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null" version="1" name="LayoutDesigner">
  <Name>LayoutDesigner</Name>
  <Size>1306, 1656</Size>
  <Object name="Label78" type="System.Windows.Forms.Label, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089">
    <Text>BCR </Text>
    <Location>920, 1572</Location>
    <Size>22, 11</Size>
  </Object>
  <Object name="WidgetBelt96" type="SmartFactory.SmartCIM.GUI.Widgets.WidgetBelt, SmartFactory.SmartCIM.GUI, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null">
    <UnitId>B1ACNV13301-132</UnitId>
    <Location>920, 1572</Location>
    <Size>50, 25</Size>
    <Text>WidgetBelt96</Text>
  </Object>
  <Object name="WidgetArrow1" type="SmartFactory.SmartCIM.GUI.Widgets.WidgetArrow, SmartFactory.SmartCIM.GUI, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null">
    <FlowDirection>Angle_90</FlowDirection>
    <Location>100, 200</Location>
    <Size>30, 20</Size>
  </Object>
</Object>`

	tmpDir, err := os.MkdirTemp("", "map_layout_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	path := filepath.Join(tmpDir, "test_layout.xml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	layout, err := ParseMapXML(path)
	if err != nil {
		t.Fatalf("ParseMapXML failed: %v", err)
	}

	// Should have 3 objects (Label78, WidgetBelt96, WidgetArrow1)
	if len(layout.Objects) != 3 {
		t.Errorf("expected 3 objects, got %d: %v", len(layout.Objects), layout.Objects)
	}

	// Check Label
	label, ok := layout.Objects["Label78"]
	if !ok {
		t.Fatal("Label78 not found")
	}
	if label.Type != "System.Windows.Forms.Label, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089" {
		t.Errorf("unexpected label type: %s", label.Type)
	}
	if label.Text != "BCR " {
		t.Errorf("unexpected label text: %s", label.Text)
	}
	if label.Location != "920, 1572" {
		t.Errorf("unexpected label location: %s", label.Location)
	}

	// Check Belt
	belt, ok := layout.Objects["WidgetBelt96"]
	if !ok {
		t.Fatal("WidgetBelt96 not found")
	}
	if belt.Type != "SmartFactory.SmartCIM.GUI.Widgets.WidgetBelt, SmartFactory.SmartCIM.GUI, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null" {
		t.Errorf("unexpected belt type: %s", belt.Type)
	}
	if belt.UnitId != "B1ACNV13301-132" {
		t.Errorf("unexpected belt unitId: %s", belt.UnitId)
	}

	// Check Arrow
	arrow, ok := layout.Objects["WidgetArrow1"]
	if !ok {
		t.Fatal("WidgetArrow1 not found")
	}
	if arrow.FlowDirection != "Angle_90" {
		t.Errorf("unexpected arrow flowDirection: %s", arrow.FlowDirection)
	}
}
