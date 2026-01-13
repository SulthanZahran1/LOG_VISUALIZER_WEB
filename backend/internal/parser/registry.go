package parser

import (
	"fmt"
	"strings"
)

// Registry holds all available parsers and provides auto-detection.
type Registry struct {
	parsers []Parser
}

// Global registry instance
var globalRegistry = NewRegistry()

func NewRegistry() *Registry {
	return &Registry{
		parsers: []Parser{
			NewPLCDebugParser(),
			NewPLCTabParser(),
			NewMCSLogParser(),
			NewCSVSignalParser(),
		},
	}
}

// GetGlobalRegistry returns the singleton registry.
func GetGlobalRegistry() *Registry {
	return globalRegistry
}

// Register adds a new parser to the registry.
func (r *Registry) Register(p Parser) {
	r.parsers = append(r.parsers, p)
}

// FindParser detects the correct parser for a file.
func (r *Registry) FindParser(filePath string) (Parser, error) {
	for _, p := range r.parsers {
		can, err := p.CanParse(filePath)
		if err != nil {
			continue // Log error?
		}
		if can {
			return p, nil
		}
	}
	return nil, fmt.Errorf("no suitable parser found for file: %s", filePath)
}

// GetParserByName returns a parser by its name.
func (r *Registry) GetParserByName(name string) (Parser, error) {
	name = strings.ToLower(name)
	for _, p := range r.parsers {
		if strings.ToLower(p.Name()) == name {
			return p, nil
		}
	}
	return nil, fmt.Errorf("parser not found: %s", name)
}
