// mock_storage.go - Mock storage implementation for testing
package testutil

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
	"github.com/plc-visualizer/backend/internal/storage"
)

// MockStorage implements storage.Store for testing
type MockStorage struct {
	files      map[string]*models.FileInfo
	fileData   map[string][]byte
	chunks     map[string]map[int][]byte // uploadID -> chunkIndex -> data
	mu         sync.RWMutex
}

// NewMockStorage creates a new mock storage with default implementations
func NewMockStorage() *MockStorage {
	return &MockStorage{
		files:    make(map[string]*models.FileInfo),
		fileData: make(map[string][]byte),
		chunks:   make(map[string]map[int][]byte),
	}
}

func (m *MockStorage) Save(name string, r io.Reader) (*models.FileInfo, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	return m.SaveBytes(name, data)
}

func (m *MockStorage) SaveBytes(name string, data []byte) (*models.FileInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := generateTestID()
	file := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       int64(len(data)),
		UploadedAt: time.Now(),
	}

	m.files[id] = file
	m.fileData[id] = data
	return file, nil
}

func (m *MockStorage) Get(id string) (*models.FileInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	file, ok := m.files[id]
	if !ok {
		return nil, errors.New("file not found")
	}
	return file, nil
}

func (m *MockStorage) List(limit int) ([]*models.FileInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var files []*models.FileInfo
	for _, file := range m.files {
		files = append(files, file)
		if limit > 0 && len(files) >= limit {
			break
		}
	}
	return files, nil
}

func (m *MockStorage) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.files[id]; !exists {
		return errors.New("file not found")
	}

	delete(m.files, id)
	delete(m.fileData, id)
	return nil
}

func (m *MockStorage) Rename(id string, newName string) (*models.FileInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	file, ok := m.files[id]
	if !ok {
		return nil, errors.New("file not found")
	}

	file.Name = newName
	return file, nil
}

func (m *MockStorage) GetFilePath(id string) (string, error) {
	return "/mock/path/" + id, nil
}

func (m *MockStorage) SaveChunk(uploadID string, chunkIndex int, r io.Reader) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	return m.SaveChunkBytes(uploadID, chunkIndex, data)
}

func (m *MockStorage) SaveChunkBytes(uploadID string, chunkIndex int, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.chunks[uploadID] == nil {
		m.chunks[uploadID] = make(map[int][]byte)
	}
	m.chunks[uploadID][chunkIndex] = data
	return nil
}

func (m *MockStorage) CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	uploadChunks, ok := m.chunks[uploadID]
	if !ok {
		return nil, errors.New("upload not found")
	}

	// Concatenate all chunks
	var data bytes.Buffer
	for i := 0; i < totalChunks; i++ {
		chunk, ok := uploadChunks[i]
		if !ok {
			return nil, errors.New("missing chunk")
		}
		data.Write(chunk)
	}

	// Save as complete file
	id := generateTestID()
	file := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       int64(data.Len()),
		UploadedAt: time.Now(),
	}

	m.files[id] = file
	m.fileData[id] = data.Bytes()
	delete(m.chunks, uploadID)

	return file, nil
}

// Ensure MockStorage implements storage.Store
var _ storage.Store = (*MockStorage)(nil)

// Test Helper Methods

// AddFile adds a file directly to the mock
func (m *MockStorage) AddFile(id string, name string, data []byte) *models.FileInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	file := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       int64(len(data)),
		UploadedAt: time.Now(),
	}
	m.files[id] = file
	m.fileData[id] = data
	return file
}

// GetFileData returns the file content
func (m *MockStorage) GetFileData(id string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	data, ok := m.fileData[id]
	if !ok {
		return nil, errors.New("file not found")
	}
	return data, nil
}

// GetFileCount returns the number of stored files
func (m *MockStorage) GetFileCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.files)
}

// Clear removes all files
func (m *MockStorage) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.files = make(map[string]*models.FileInfo)
	m.fileData = make(map[string][]byte)
	m.chunks = make(map[string]map[int][]byte)
}

// generateTestID generates a simple test ID
var testIDCounter int
var testIDMutex sync.Mutex

func generateTestID() string {
	testIDMutex.Lock()
	defer testIDMutex.Unlock()
	testIDCounter++
	return fmt.Sprintf("test-id-%d", testIDCounter)
}

// MockStorageWithTempDir is a mock storage that actually writes files to disk
// This is useful for tests that need to read files from disk (e.g., XML parsing)
type MockStorageWithTempDir struct {
	MockStorage
	tempDir string
}

// NewMockStorageWithTempDir creates a new mock storage that writes files to the given temp directory
func NewMockStorageWithTempDir(tempDir string) *MockStorageWithTempDir {
	return &MockStorageWithTempDir{
		MockStorage: MockStorage{
			files:    make(map[string]*models.FileInfo),
			fileData: make(map[string][]byte),
			chunks:   make(map[string]map[int][]byte),
		},
		tempDir: tempDir,
	}
}

// AddFile writes the file to disk and adds it to the mock
func (m *MockStorageWithTempDir) AddFile(id string, name string, data []byte) *models.FileInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Write file to disk
	filePath := filepath.Join(m.tempDir, id+"_"+name)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		panic(fmt.Sprintf("failed to write test file: %v", err))
	}

	file := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       int64(len(data)),
		UploadedAt: time.Now(),
	}
	m.files[id] = file
	m.fileData[id] = data
	return file
}

// GetFilePath returns the actual file path on disk
func (m *MockStorageWithTempDir) GetFilePath(id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	file, ok := m.files[id]
	if !ok {
		return "", errors.New("file not found")
	}

	return filepath.Join(m.tempDir, id+"_"+file.Name), nil
}
