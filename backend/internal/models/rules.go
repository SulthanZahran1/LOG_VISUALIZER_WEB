package models

// MapRules defines the YAML configuration for device-to-unit mapping and color rules.
// This mirrors the Python reference implementation's mappings_and_rules.yaml format.
type MapRules struct {
	DefaultColor string          `json:"defaultColor" yaml:"default_color"`
	DeviceToUnit []DeviceMapping `json:"deviceToUnit" yaml:"device_to_unit"`
	Rules        []ColorRule     `json:"rules" yaml:"rules"`
}

// DeviceMapping maps device ID patterns (with wildcards) to UnitId values.
type DeviceMapping struct {
	Pattern string `json:"pattern" yaml:"pattern"`
	UnitId  string `json:"unitId" yaml:"unit_id"`
}

// ColorRule defines a signal-based color rule with priority.
// Higher priority rules are evaluated first.
type ColorRule struct {
	Signal    string `json:"signal" yaml:"signal"`
	Op        string `json:"op" yaml:"op"`                                    // "==", ">", ">=", "<", "<="
	Value     any    `json:"value" yaml:"value"`                              // Can be string, int, or float
	Color     string `json:"color,omitempty" yaml:"color,omitempty"`          // Resulting color
	BgColor   string `json:"bgColor,omitempty" yaml:"bg_color,omitempty"`     // Background color (for overlays)
	Text      string `json:"text,omitempty" yaml:"text,omitempty"`            // Text overlay (e.g., "X" for error)
	TextColor string `json:"textColor,omitempty" yaml:"text_color,omitempty"` // Text overlay color
	Priority  int    `json:"priority" yaml:"priority"`
}

// RulesInfo contains metadata about an uploaded rules file.
type RulesInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	UploadedAt  string `json:"uploadedAt"`
	RulesCount  int    `json:"rulesCount"`
	DeviceCount int    `json:"deviceCount"`
}
