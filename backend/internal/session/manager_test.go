package session

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

func TestSessionManager(t *testing.T) {
	// Create a dummy log file
	tmpFile := "test_manager.log"
	content := "2025-09-22 13:00:00.199 [Debug] [SYSTEM/PATH/DEV-1] [INPUT:SIG1] (Boolean) : ON\n"
	os.WriteFile(tmpFile, []byte(content), 0644)
	defer os.Remove(tmpFile)

	m := NewManager()

	// Start session
	sess, err := m.StartSession("file-1", tmpFile)
	if err != nil {
		t.Fatalf("Failed to start session: %v", err)
	}

	// Poll for completion
	maxRetries := 10
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
		time.Sleep(100 * time.Millisecond)
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
