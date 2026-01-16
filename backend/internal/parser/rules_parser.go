package parser

import (
	"io"
	"os"

	"github.com/plc-visualizer/backend/internal/models"
	"gopkg.in/yaml.v3"
)

// ParseMapRules parses a YAML rules file for device-to-unit mappings and color rules.
// The YAML format mirrors the reference `sorting_line_rules.yaml`.
func ParseMapRules(filePath string) (*models.MapRules, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	return ParseMapRulesFromReader(file)
}

// ParseMapRulesFromReader parses rules from an io.Reader.
func ParseMapRulesFromReader(r io.Reader) (*models.MapRules, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}

	var rules models.MapRules
	if err := yaml.Unmarshal(data, &rules); err != nil {
		return nil, err
	}

	return &rules, nil
}
