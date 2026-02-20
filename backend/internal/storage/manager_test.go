// manager_test.go - Tests for storage layer
package storage

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

func createTestStore(t *testing.T) (*LocalStore, func()) {
	tempDir := t.TempDir()
	store, err := NewLocalStore(tempDir)
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	
	cleanup := func() {
		// Cleanup is handled by t.TempDir() automatically
	}
	
	return store, cleanup
}

func TestNewLocalStore(t *testing.T) {
	t.Run("creates store successfully", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		if store == nil {
			t.Error("Expected store to be created")
		}
		if store.uploadDir == "" {
			t.Error("Expected uploadDir to be set")
		}
	})
	
	t.Run("creates upload directory", func(t *testing.T) {
		tempDir := t.TempDir()
		uploadDir := filepath.Join(tempDir, "uploads")
		
		store, err := NewLocalStore(uploadDir)
		if err != nil {
			t.Fatalf("Failed to create store: %v", err)
		}
		
		// Verify directory was created
		if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
			t.Error("Expected upload directory to be created")
		}
		
		_ = store
	})
}

func TestLocalStore_Save(t *testing.T) {
	t.Run("saves file from reader", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		content := "Hello, World!"
		reader := strings.NewReader(content)
		
		info, err := store.Save("test.txt", reader)
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		if info.ID == "" {
			t.Error("Expected ID to be set")
		}
		if info.Name != "test.txt" {
			t.Errorf("Expected name 'test.txt', got %v", info.Name)
		}
		if info.Size != int64(len(content)) {
			t.Errorf("Expected size %d, got %d", len(content), info.Size)
		}
		if info.Status != "uploaded" {
			t.Errorf("Expected status 'uploaded', got %v", info.Status)
		}
	})
	
	t.Run("saves empty file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		reader := strings.NewReader("")
		
		info, err := store.Save("empty.txt", reader)
		if err != nil {
			t.Fatalf("Failed to save empty file: %v", err)
		}
		
		if info.Size != 0 {
			t.Errorf("Expected size 0, got %d", info.Size)
		}
	})
	
	t.Run("creates physical file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		content := "Test content"
		reader := strings.NewReader(content)
		
		info, err := store.Save("test.txt", reader)
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		// Verify physical file exists
		filePath := filepath.Join(store.uploadDir, info.ID)
		data, err := os.ReadFile(filePath)
		if err != nil {
			t.Fatalf("Failed to read saved file: %v", err)
		}
		
		if string(data) != content {
			t.Errorf("Expected content '%s', got '%s'", content, string(data))
		}
	})
}

func TestLocalStore_SaveBytes(t *testing.T) {
	t.Run("saves file from bytes", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		data := []byte("Hello from bytes!")
		
		info, err := store.SaveBytes("bytes.txt", data)
		if err != nil {
			t.Fatalf("Failed to save bytes: %v", err)
		}
		
		if info.Size != int64(len(data)) {
			t.Errorf("Expected size %d, got %d", len(data), info.Size)
		}
		
		// Verify physical file
		filePath := filepath.Join(store.uploadDir, info.ID)
		savedData, err := os.ReadFile(filePath)
		if err != nil {
			t.Fatalf("Failed to read saved file: %v", err)
		}
		
		if !bytes.Equal(savedData, data) {
			t.Error("Saved data doesn't match original")
		}
	})
}

func TestLocalStore_Get(t *testing.T) {
	t.Run("gets existing file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save a file first
		info, err := store.Save("test.txt", strings.NewReader("content"))
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		// Get it back
		retrieved, err := store.Get(info.ID)
		if err != nil {
			t.Fatalf("Failed to get file: %v", err)
		}
		
		if retrieved.ID != info.ID {
			t.Errorf("Expected ID %s, got %s", info.ID, retrieved.ID)
		}
		if retrieved.Name != info.Name {
			t.Errorf("Expected name %s, got %s", info.Name, retrieved.Name)
		}
	})
	
	t.Run("returns error for non-existent file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		_, err := store.Get("non-existent-id")
		if err == nil {
			t.Error("Expected error for non-existent file")
		}
	})
}

func TestLocalStore_List(t *testing.T) {
	t.Run("lists files", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save multiple files
		for i := 0; i < 5; i++ {
			_, err := store.Save("file.txt", strings.NewReader("content"))
			if err != nil {
				t.Fatalf("Failed to save file: %v", err)
			}
			time.Sleep(10 * time.Millisecond) // Ensure different timestamps
		}
		
		// List all
		files, err := store.List(10)
		if err != nil {
			t.Fatalf("Failed to list files: %v", err)
		}
		
		if len(files) != 5 {
			t.Errorf("Expected 5 files, got %d", len(files))
		}
	})
	
	t.Run("limits results", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save multiple files
		for i := 0; i < 10; i++ {
			_, err := store.Save("file.txt", strings.NewReader("content"))
			if err != nil {
				t.Fatalf("Failed to save file: %v", err)
			}
			time.Sleep(5 * time.Millisecond)
		}
		
		// List with limit
		files, err := store.List(3)
		if err != nil {
			t.Fatalf("Failed to list files: %v", err)
		}
		
		if len(files) != 3 {
			t.Errorf("Expected 3 files, got %d", len(files))
		}
	})
	
	t.Run("sorts by upload time descending", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save files with delays
		infos := make([]string, 3)
		for i := 0; i < 3; i++ {
			info, err := store.Save("file.txt", strings.NewReader("content"))
			if err != nil {
				t.Fatalf("Failed to save file: %v", err)
			}
			infos[i] = info.ID
			time.Sleep(20 * time.Millisecond)
		}
		
		// List should be in reverse order (most recent first)
		files, err := store.List(3)
		if err != nil {
			t.Fatalf("Failed to list files: %v", err)
		}
		
		// Most recent should be the last one saved
		if files[0].ID != infos[2] {
			t.Error("Expected files to be sorted by time descending")
		}
	})
}

func TestLocalStore_Delete(t *testing.T) {
	t.Run("deletes existing file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save a file
		info, err := store.Save("test.txt", strings.NewReader("content"))
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		// Verify file exists
		filePath := filepath.Join(store.uploadDir, info.ID)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Fatal("File should exist before deletion")
		}
		
		// Delete it
		err = store.Delete(info.ID)
		if err != nil {
			t.Fatalf("Failed to delete file: %v", err)
		}
		
		// Verify file is gone from metadata
		_, err = store.Get(info.ID)
		if err == nil {
			t.Error("Expected error when getting deleted file")
		}
		
		// Verify physical file is gone
		if _, err := os.Stat(filePath); !os.IsNotExist(err) {
			t.Error("Physical file should be deleted")
		}
	})
	
	t.Run("returns error for non-existent file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		err := store.Delete("non-existent-id")
		if err == nil {
			t.Error("Expected error when deleting non-existent file")
		}
	})
}

func TestLocalStore_Rename(t *testing.T) {
	t.Run("renames existing file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save a file
		info, err := store.Save("oldname.txt", strings.NewReader("content"))
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		// Rename it
		updated, err := store.Rename(info.ID, "newname.txt")
		if err != nil {
			t.Fatalf("Failed to rename file: %v", err)
		}
		
		if updated.Name != "newname.txt" {
			t.Errorf("Expected name 'newname.txt', got %v", updated.Name)
		}
		
		// Verify by getting the file
		retrieved, err := store.Get(info.ID)
		if err != nil {
			t.Fatalf("Failed to get file: %v", err)
		}
		
		if retrieved.Name != "newname.txt" {
			t.Errorf("Expected persisted name 'newname.txt', got %v", retrieved.Name)
		}
	})
	
	t.Run("returns error for non-existent file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		_, err := store.Rename("non-existent-id", "newname.txt")
		if err == nil {
			t.Error("Expected error when renaming non-existent file")
		}
	})
}

func TestLocalStore_GetFilePath(t *testing.T) {
	t.Run("returns file path for existing file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save a file
		info, err := store.Save("test.txt", strings.NewReader("content"))
		if err != nil {
			t.Fatalf("Failed to save file: %v", err)
		}
		
		// Get path
		path, err := store.GetFilePath(info.ID)
		if err != nil {
			t.Fatalf("Failed to get file path: %v", err)
		}
		
		expectedPath := filepath.Join(store.uploadDir, info.ID)
		if path != expectedPath {
			t.Errorf("Expected path %s, got %s", expectedPath, path)
		}
	})
	
	t.Run("returns error for non-existent file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		_, err := store.GetFilePath("non-existent-id")
		if err == nil {
			t.Error("Expected error when getting path for non-existent file")
		}
	})
}

func TestLocalStore_SaveChunk(t *testing.T) {
	t.Run("saves chunk", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		uploadID := "upload-123"
		chunkIndex := 0
		content := "Chunk data"
		
		err := store.SaveChunk(uploadID, chunkIndex, strings.NewReader(content))
		if err != nil {
			t.Fatalf("Failed to save chunk: %v", err)
		}
		
		// Verify chunk file exists
		chunkPath := filepath.Join(store.uploadDir, "chunks", uploadID, "chunk_0")
		data, err := os.ReadFile(chunkPath)
		if err != nil {
			t.Fatalf("Failed to read chunk: %v", err)
		}
		
		if string(data) != content {
			t.Errorf("Expected chunk content '%s', got '%s'", content, string(data))
		}
	})
	
	t.Run("saves multiple chunks", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		uploadID := "upload-456"
		
		for i := 0; i < 3; i++ {
			content := "Chunk " + string(rune('A'+i))
			err := store.SaveChunk(uploadID, i, strings.NewReader(content))
			if err != nil {
				t.Fatalf("Failed to save chunk %d: %v", i, err)
			}
		}
		
		// Verify all chunks exist
		for i := 0; i < 3; i++ {
			chunkPath := filepath.Join(store.uploadDir, "chunks", uploadID, "chunk_"+string(rune('0'+i)))
			if _, err := os.Stat(chunkPath); os.IsNotExist(err) {
				t.Errorf("Chunk %d should exist", i)
			}
		}
	})
}

func TestLocalStore_SaveChunkBytes(t *testing.T) {
	t.Run("saves chunk from bytes", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		uploadID := "upload-789"
		chunkIndex := 0
		data := []byte("Chunk bytes data")
		
		err := store.SaveChunkBytes(uploadID, chunkIndex, data)
		if err != nil {
			t.Fatalf("Failed to save chunk bytes: %v", err)
		}
		
		// Verify chunk file
		chunkPath := filepath.Join(store.uploadDir, "chunks", uploadID, "chunk_0")
		savedData, err := os.ReadFile(chunkPath)
		if err != nil {
			t.Fatalf("Failed to read chunk: %v", err)
		}
		
		if !bytes.Equal(savedData, data) {
			t.Error("Saved chunk data doesn't match original")
		}
	})
}

func TestLocalStore_CompleteChunkedUpload(t *testing.T) {
	t.Run("assembles chunks into final file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		uploadID := "upload-complete"
		chunks := []string{"Hello ", "World", "!"}
		
		// Save chunks
		for i, content := range chunks {
			err := store.SaveChunk(uploadID, i, strings.NewReader(content))
			if err != nil {
				t.Fatalf("Failed to save chunk %d: %v", i, err)
			}
		}
		
		// Complete upload
		info, err := store.CompleteChunkedUpload(uploadID, "assembled.txt", len(chunks))
		if err != nil {
			t.Fatalf("Failed to complete upload: %v", err)
		}
		
		// Verify metadata
		if info.Name != "assembled.txt" {
			t.Errorf("Expected name 'assembled.txt', got %v", info.Name)
		}
		
		expectedSize := int64(len("Hello ") + len("World") + len("!"))
		if info.Size != expectedSize {
			t.Errorf("Expected size %d, got %d", expectedSize, info.Size)
		}
		
		// Verify assembled file
		filePath := filepath.Join(store.uploadDir, info.ID)
		data, err := os.ReadFile(filePath)
		if err != nil {
			t.Fatalf("Failed to read assembled file: %v", err)
		}
		
		if string(data) != "Hello World!" {
			t.Errorf("Expected 'Hello World!', got '%s'", string(data))
		}
		
		// Verify chunks are cleaned up
		chunkDir := filepath.Join(store.uploadDir, "chunks", uploadID)
		if _, err := os.Stat(chunkDir); !os.IsNotExist(err) {
			t.Error("Chunk directory should be cleaned up")
		}
	})
	
	t.Run("returns error for missing chunks", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		uploadID := "upload-incomplete"
		
		// Save only 1 chunk but claim 3
		err := store.SaveChunk(uploadID, 0, strings.NewReader("chunk0"))
		if err != nil {
			t.Fatalf("Failed to save chunk: %v", err)
		}
		
		_, err = store.CompleteChunkedUpload(uploadID, "incomplete.txt", 3)
		if err == nil {
			t.Error("Expected error when chunks are missing")
		}
	})
}

func TestLocalStore_RegisterFile(t *testing.T) {
	t.Run("registers existing file", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Create a file directly
		filePath := filepath.Join(store.uploadDir, "existing-file")
		content := []byte("Existing content")
		err := os.WriteFile(filePath, content, 0644)
		if err != nil {
			t.Fatalf("Failed to create file: %v", err)
		}
		
		// Register it
		info := &models.FileInfo{
			ID:         "existing-file",
			Name:       "registered.txt",
			Size:       int64(len(content)),
			UploadedAt: time.Now(),
			Status:     "uploaded",
		}
		store.RegisterFile(info)
		
		// Verify it can be retrieved
		retrieved, err := store.Get("existing-file")
		if err != nil {
			t.Fatalf("Failed to get registered file: %v", err)
		}
		
		if retrieved.Name != "registered.txt" {
			t.Errorf("Expected name 'registered.txt', got %v", retrieved.Name)
		}
	})
}

func TestLocalStore_ConcurrentAccess(t *testing.T) {
	t.Run("handles concurrent saves", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		// Save files concurrently
		done := make(chan bool, 10)
		for i := 0; i < 10; i++ {
			go func(n int) {
				content := "Content " + string(rune('0'+n))
				_, err := store.Save("file.txt", strings.NewReader(content))
				if err != nil {
					t.Errorf("Failed to save file: %v", err)
				}
				done <- true
			}(i)
		}
		
		// Wait for all goroutines
		for i := 0; i < 10; i++ {
			<-done
		}
		
		// Verify all files were saved
		files, err := store.List(20)
		if err != nil {
			t.Fatalf("Failed to list files: %v", err)
		}
		
		if len(files) != 10 {
			t.Errorf("Expected 10 files, got %d", len(files))
		}
	})
}

// mockReader is a reader that can simulate errors
type mockReader struct {
	data      []byte
	readCount int
	failAfter int
}

func (m *mockReader) Read(p []byte) (n int, err error) {
	if m.readCount >= m.failAfter {
		return 0, io.ErrUnexpectedEOF
	}
	m.readCount++
	n = copy(p, m.data)
	return n, nil
}

func TestLocalStore_ErrorHandling(t *testing.T) {
	t.Run("handles read error during save", func(t *testing.T) {
		store, cleanup := createTestStore(t)
		defer cleanup()
		
		reader := &mockReader{
			data:      []byte("data"),
			failAfter: 0,
		}
		
		_, err := store.Save("test.txt", reader)
		if err == nil {
			t.Error("Expected error when reader fails")
		}
	})
}
