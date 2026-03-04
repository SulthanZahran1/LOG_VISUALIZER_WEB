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

func TestSessionManager_ObservableLogUsesDuckStore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "session-manager-observable-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	parsedDir := filepath.Join(tmpDir, "parsed")
	tempDir := filepath.Join(tmpDir, "temp")
	os.MkdirAll(parsedDir, 0755)
	os.MkdirAll(tempDir, 0755)

	t.Setenv("PARSED_DB_DIR", parsedDir)
	t.Setenv("DUCKDB_TEMP_DIR", tempDir)

	tmpFile := filepath.Join(tmpDir, "observable.log")
	content := "date  time  status  variables device-id datatype  tag\n" +
		"2026-02-19 00:02:10:955`OBSERVABLE`CIM WRITE>>> TRANSFER_REQ`B1ASTO15203-102`Boolean`False`True`1`OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=TransferRequest\n" +
		"2026-02-19 00:02:11:624`OBSERVABLE`CIM READ <<< EQUIPMENT_STATE`B1ASTO15203-102`Short`2`3`1`OWNERID=Devices,DEVICE_TYPE=Cranes,INDEX=2,TAG_NAME=EquipmentState\n"
	if err := os.WriteFile(tmpFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	m := NewManager()

	sess, err := m.StartSession("observable-file", tmpFile)
	if err != nil {
		t.Fatalf("Failed to start session: %v", err)
	}

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

	state, ok := m.sessions[sess.ID]
	if !ok {
		t.Fatalf("Session state not found")
	}
	if state.DuckStore == nil {
		t.Fatal("Expected observable log session to use DuckStore")
	}
	if state.DuckStore.Len() != 2 {
		t.Fatalf("Expected observable DuckStore to contain 2 entries, got %d", state.DuckStore.Len())
	}
	if state.Session.EntryCount != 2 {
		t.Fatalf("Expected session EntryCount=2, got %d", state.Session.EntryCount)
	}
}

func TestSessionManager_GenericLogUsesDuckStoreAdapter(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "session-manager-generic-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	parsedDir := filepath.Join(tmpDir, "parsed")
	tempDir := filepath.Join(tmpDir, "temp")
	os.MkdirAll(parsedDir, 0755)
	os.MkdirAll(tempDir, 0755)

	t.Setenv("PARSED_DB_DIR", parsedDir)
	t.Setenv("DUCKDB_TEMP_DIR", tempDir)

	tmpFile := filepath.Join(tmpDir, "generic.log")
	content := "2026-02-19 00:02:10.955 [INFO] message one\n" +
		"2026-02-19 00:02:11.624 [WARN] message two\n"
	if err := os.WriteFile(tmpFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	m := NewManager()

	sess, err := m.StartSession("generic-file", tmpFile)
	if err != nil {
		t.Fatalf("Failed to start session: %v", err)
	}

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

	state, ok := m.sessions[sess.ID]
	if !ok {
		t.Fatalf("Session state not found")
	}
	if state.DuckStore == nil {
		t.Fatal("Expected generic log session to use DuckStore adapter")
	}
	if state.DuckStore.Len() != 2 {
		t.Fatalf("Expected generic DuckStore to contain 2 entries, got %d", state.DuckStore.Len())
	}
}
