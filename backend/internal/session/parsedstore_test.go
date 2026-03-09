package session

import (
	"os"
	"testing"
)

func TestPersistentParsedStore_CreateForFileRemovesStaleArtifacts(t *testing.T) {
	parsedStore := NewPersistentParsedStoreWithDir(t.TempDir())
	dbPath := parsedStore.GetDBPath("file-1")

	if err := os.WriteFile(dbPath, []byte("stale"), 0644); err != nil {
		t.Fatalf("Failed to create stale artifact %s: %v", dbPath, err)
	}
	if err := os.Mkdir(dbPath+".wal", 0755); err != nil {
		t.Fatalf("Failed to create stale wal directory: %v", err)
	}
	if err := os.WriteFile(dbPath+".tmp", []byte("stale"), 0644); err != nil {
		t.Fatalf("Failed to create stale artifact %s: %v", dbPath+".tmp", err)
	}

	store, err := parsedStore.CreateForFile("file-1")
	if err != nil {
		t.Fatalf("CreateForFile failed: %v", err)
	}
	defer store.Close()

	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("Expected recreated DuckDB file at %s: %v", dbPath, err)
	}
	if info, err := os.Stat(dbPath + ".wal"); err == nil && info.IsDir() {
		t.Fatalf("Expected stale wal directory to be replaced, but %s is still a directory", dbPath+".wal")
	}
	if _, err := os.Stat(dbPath + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("Expected stale artifact %s to be removed, stat err=%v", dbPath+".tmp", err)
	}
}

func TestPersistentParsedStore_DeleteRemovesAllArtifacts(t *testing.T) {
	parsedStore := NewPersistentParsedStoreWithDir(t.TempDir())
	dbPath := parsedStore.GetDBPath("file-2")

	for _, path := range []string{dbPath, dbPath + ".wal", dbPath + ".tmp"} {
		if err := os.WriteFile(path, []byte("stale"), 0644); err != nil {
			t.Fatalf("Failed to create artifact %s: %v", path, err)
		}
	}
	parsedStore.MarkComplete("file-2")

	if err := parsedStore.Delete("file-2"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	for _, path := range []string{dbPath, dbPath + ".wal", dbPath + ".tmp"} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("Expected %s to be removed, stat err=%v", path, err)
		}
	}
}
