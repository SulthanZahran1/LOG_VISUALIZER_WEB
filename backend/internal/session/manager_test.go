package session

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

func TestSessionManager(t *testing.T) {
	// Create a temporary directory for test data
	tmpDir, err := os.MkdirTemp("", "session-manager-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set environment variables for test isolation
	parsedDir := filepath.Join(tmpDir, "parsed")
	tempDir := filepath.Join(tmpDir, "temp")
	os.MkdirAll(parsedDir, 0755)
	os.MkdirAll(tempDir, 0755)
	
	t.Setenv("PARSED_DB_DIR", parsedDir)
	t.Setenv("DUCKDB_TEMP_DIR", tempDir)

	// Create a dummy log file
	tmpFile := filepath.Join(tmpDir, "test_manager.log")
	content := "2025-09-22 13:00:00.199 [Debug] [SYSTEM/PATH/DEV-1] [INPUT:SIG1] (Boolean) : ON\n"
	if err := os.WriteFile(tmpFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	m := NewManager()

	// Start session
	sess, err := m.StartSession("file-1", tmpFile)
	if err != nil {
		t.Fatalf("Failed to start session: %v", err)
	}

	// Poll for completion
	maxRetries := 20
	for i := 0; i < maxRetries; i++ {
		s, ok := m.GetSession(sess.ID)
		if !ok {
			t.Fatalf("Session not found")
		}
		if s.Status == models.SessionStatusComplete {
			break
		}
		if s.Status == models.SessionStatusError {
			t.Fatalf("Session error: %v", s.Errors)
		}
		time.Sleep(200 * time.Millisecond)
	}

	// Verify entries
	entries, total, ok := m.GetEntries(context.Background(), sess.ID, 1, 10)
	if !ok {
		t.Fatalf("Failed to get entries")
	}
	if total != 1 {
		t.Errorf("Expected 1 entry, got %d", total)
	}
	if len(entries) != 1 {
		t.Errorf("Expected 1 entry in page, got %d", len(entries))
	}
	if entries[0].DeviceID != "DEV-1" {
		t.Errorf("Expected DeviceID DEV-1, got %s", entries[0].DeviceID)
	}
}
