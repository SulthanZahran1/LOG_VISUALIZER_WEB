package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/plc-visualizer/backend/internal/models"
)

// Store defines the interface for file storage.
type Store interface {
	Save(name string, r io.Reader) (*models.FileInfo, error)
	Get(id string) (*models.FileInfo, error)
	List(limit int) ([]*models.FileInfo, error)
	Delete(id string) error
	Rename(id string, newName string) (*models.FileInfo, error)
	GetFilePath(id string) (string, error)
	SaveChunk(uploadID string, chunkIndex int, r io.Reader) error
	CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error)
}

// LocalStore implements Store using the local filesystem.
type LocalStore struct {
	mu        sync.RWMutex
	uploadDir string
	files     map[string]*models.FileInfo
}

// NewLocalStore creates a new LocalStore.
func NewLocalStore(uploadDir string) (*LocalStore, error) {
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("creating upload directory: %w", err)
	}

	return &LocalStore{
		uploadDir: uploadDir,
		files:     make(map[string]*models.FileInfo),
	}, nil
}

// Save saves a file to the local filesystem.
func (s *LocalStore) Save(name string, r io.Reader) (*models.FileInfo, error) {
	id := uuid.New().String()
	path := filepath.Join(s.uploadDir, id)

	f, err := os.Create(path)
	if err != nil {
		return nil, fmt.Errorf("creating file: %w", err)
	}
	defer f.Close()

	size, err := io.Copy(f, r)
	if err != nil {
		os.Remove(path)
		return nil, fmt.Errorf("writing file: %w", err)
	}

	info := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       size,
		UploadedAt: time.Now(),
		Status:     "uploaded",
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.files[id] = info

	return info, nil
}

// Get retrieves file metadata by ID.
func (s *LocalStore) Get(id string) (*models.FileInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	info, ok := s.files[id]
	if !ok {
		return nil, fmt.Errorf("file not found: %s", id)
	}

	return info, nil
}

// List returns the most recent files.
func (s *LocalStore) List(limit int) ([]*models.FileInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var list []*models.FileInfo
	for _, info := range s.files {
		list = append(list, info)
	}

	// Sort by UploadedAt desc
	sort.Slice(list, func(i, j int) bool {
		return list[i].UploadedAt.After(list[j].UploadedAt)
	})

	if len(list) > limit {
		list = list[:limit]
	}

	return list, nil
}

// Delete removes a file from storage.
func (s *LocalStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, ok := s.files[id]
	if !ok {
		return fmt.Errorf("file not found: %s", id)
	}

	path := filepath.Join(s.uploadDir, id)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("deleting file: %w", err)
	}

	delete(s.files, id)
	_ = info // Silence unused warning if any

	return nil
}

// Rename updates the display name of a file.
func (s *LocalStore) Rename(id string, newName string) (*models.FileInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, ok := s.files[id]
	if !ok {
		return nil, fmt.Errorf("file not found: %s", id)
	}

	info.Name = newName
	return info, nil
}

// GetFilePath returns the absolute path to a file.
func (s *LocalStore) GetFilePath(id string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if _, ok := s.files[id]; !ok {
		return "", fmt.Errorf("file not found: %s", id)
	}

	return filepath.Join(s.uploadDir, id), nil
}

// SaveChunk saves a single chunk to a temporary location.
func (s *LocalStore) SaveChunk(uploadID string, chunkIndex int, r io.Reader) error {
	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
	if err := os.MkdirAll(chunkDir, 0755); err != nil {
		return fmt.Errorf("creating chunk directory: %w", err)
	}

	path := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", chunkIndex))
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating chunk file: %w", err)
	}
	defer f.Close()

	_, err = io.Copy(f, r)
	if err != nil {
		return fmt.Errorf("writing chunk: %w", err)
	}

	return nil
}

// CompleteChunkedUpload assembles all chunks into a final file.
func (s *LocalStore) CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
	id := uuid.New().String()
	finalPath := filepath.Join(s.uploadDir, id)
	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)

	out, err := os.Create(finalPath)
	if err != nil {
		return nil, fmt.Errorf("creating final file: %w", err)
	}
	defer out.Close()

	var totalSize int64
	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", i))
		in, err := os.Open(chunkPath)
		if err != nil {
			return nil, fmt.Errorf("opening chunk %d: %w", i, err)
		}

		n, err := io.Copy(out, in)
		in.Close()
		if err != nil {
			return nil, fmt.Errorf("copying chunk %d: %w", i, err)
		}
		totalSize += n
	}

	// Metadata
	info := &models.FileInfo{
		ID:         id,
		Name:       name,
		Size:       totalSize,
		UploadedAt: time.Now(),
		Status:     "uploaded",
	}

	s.mu.Lock()
	s.files[id] = info
	s.mu.Unlock()

	// Cleanup chunks
	os.RemoveAll(chunkDir)

	return info, nil
}
