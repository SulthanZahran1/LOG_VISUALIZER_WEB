package parser

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseMapRules(t *testing.T) {
	// Test with a sample YAML string matching the reference format
	content := `
default_color: "#D3D3D3"

device_to_unit:
  - pattern: "B1ACNV*@*"
    unit_id: "*"
  - pattern: "B1ACDV*@*"
    unit_id: "*"

rules:
  - signal: "Status"
    op: "=="
    value: "Running"
    color: "#00C853"
    priority: 100
  - signal: "Status"
    op: "=="
    value: "Error"
    bg_color: "#FFCDD2"
    text: "X"
    text_color: "#C62828"
    priority: 100
  - signal: "B"
    op: ">"
    value: 50
    color: "#D32F2F"
    priority: 45
`
	tmpDir, err := os.MkdirTemp("", "rules_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	path := filepath.Join(tmpDir, "test_rules.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	rules, err := ParseMapRules(path)
	if err != nil {
		t.Fatalf("ParseMapRules failed: %v", err)
	}

	// Check default color
	if rules.DefaultColor != "#D3D3D3" {
		t.Errorf("expected default_color #D3D3D3, got %s", rules.DefaultColor)
	}

	// Check device mappings
	if len(rules.DeviceToUnit) != 2 {
		t.Errorf("expected 2 device mappings, got %d", len(rules.DeviceToUnit))
	}
	if rules.DeviceToUnit[0].Pattern != "B1ACNV*@*" {
		t.Errorf("expected pattern B1ACNV*@*, got %s", rules.DeviceToUnit[0].Pattern)
	}

	// Check rules
	if len(rules.Rules) != 3 {
		t.Errorf("expected 3 rules, got %d", len(rules.Rules))
	}

	// Check first rule (Status == Running)
	if rules.Rules[0].Signal != "Status" {
		t.Errorf("expected signal Status, got %s", rules.Rules[0].Signal)
	}
	if rules.Rules[0].Op != "==" {
		t.Errorf("expected op ==, got %s", rules.Rules[0].Op)
	}
	if rules.Rules[0].Value != "Running" {
		t.Errorf("expected value Running, got %v", rules.Rules[0].Value)
	}
	if rules.Rules[0].Color != "#00C853" {
		t.Errorf("expected color #00C853, got %s", rules.Rules[0].Color)
	}
	if rules.Rules[0].Priority != 100 {
		t.Errorf("expected priority 100, got %d", rules.Rules[0].Priority)
	}

	// Check rule with text overlay
	if rules.Rules[1].Text != "X" {
		t.Errorf("expected text X, got %s", rules.Rules[1].Text)
	}
	if rules.Rules[1].BgColor != "#FFCDD2" {
		t.Errorf("expected bg_color #FFCDD2, got %s", rules.Rules[1].BgColor)
	}

	// Check numeric value rule
	if v, ok := rules.Rules[2].Value.(int); !ok || v != 50 {
		t.Errorf("expected value 50 (int), got %v (%T)", rules.Rules[2].Value, rules.Rules[2].Value)
	}
}

func TestParseMapRulesFromReader(t *testing.T) {
	yaml := `
default_color: "#FFFFFF"
device_to_unit: []
rules:
  - signal: "Speed"
    op: ">="
    value: 0.5
    color: "#42A5F5"
    priority: 14
`
	reader := strings.NewReader(yaml)
	rules, err := ParseMapRulesFromReader(reader)
	if err != nil {
		t.Fatalf("ParseMapRulesFromReader failed: %v", err)
	}

	if len(rules.Rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules.Rules))
	}

	// Check float value
	if v, ok := rules.Rules[0].Value.(float64); !ok || v != 0.5 {
		t.Errorf("expected value 0.5 (float64), got %v (%T)", rules.Rules[0].Value, rules.Rules[0].Value)
	}
}
