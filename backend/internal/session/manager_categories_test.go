package session

import (
	"context"
	"testing"

	"github.com/plc-visualizer/backend/internal/models"
)

func TestManager_GetCategories_MissingSession(t *testing.T) {
	m := NewManagerWithTempDir(t.TempDir())

	cats, ok := m.GetCategories(context.Background(), "missing")
	if ok {
		t.Fatalf("expected ok=false for missing session, got ok=true with categories=%v", cats)
	}
}

func TestManager_GetCategories_LegacyResult(t *testing.T) {
	m := NewManagerWithTempDir(t.TempDir())

	sessionID := "legacy-session"
	m.sessions[sessionID] = &SessionState{
		Session: models.NewParseSession(sessionID, "file-1"),
		Result: &models.ParsedLog{
			Entries: []models.LogEntry{
				{Category: "B"},
				{Category: ""},
				{Category: "A"},
				{Category: "B"},
			},
		},
	}

	cats, ok := m.GetCategories(context.Background(), sessionID)
	if !ok {
		t.Fatal("expected ok=true for existing legacy session")
	}
	if len(cats) != 2 {
		t.Fatalf("expected 2 categories, got %d (%v)", len(cats), cats)
	}
	if cats[0] != "A" || cats[1] != "B" {
		t.Fatalf("expected sorted categories [A B], got %v", cats)
	}
}

func TestManager_GetCategories_LegacyNoCategories(t *testing.T) {
	m := NewManagerWithTempDir(t.TempDir())

	sessionID := "legacy-empty"
	m.sessions[sessionID] = &SessionState{
		Session: models.NewParseSession(sessionID, "file-1"),
		Result: &models.ParsedLog{
			Entries: []models.LogEntry{
				{Category: ""},
				{Category: ""},
			},
		},
	}

	cats, ok := m.GetCategories(context.Background(), sessionID)
	if !ok {
		t.Fatal("expected ok=true for existing legacy session")
	}
	if len(cats) != 0 {
		t.Fatalf("expected empty categories, got %v", cats)
	}
}
