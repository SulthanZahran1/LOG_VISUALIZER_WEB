package upload

import (
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/plc-visualizer/backend/internal/models"
)

// Status represents the upload processing status.
type Status string

const (
	StatusProcessing    Status = "processing"
	StatusAssembling    Status = "assembling"
	StatusDecompressing Status = "decompressing"
	StatusComplete      Status = "complete"
	StatusError         Status = "error"
)

// Job represents an async upload processing job.
type Job struct {
	ID             string           `json:"id"`
	UploadID       string           `json:"uploadId"`
	FileName       string           `json:"fileName"`
	TotalChunks    int              `json:"totalChunks"`
	OriginalSize   int64            `json:"originalSize"`
	CompressedSize int64            `json:"compressedSize"`
	Encoding       string           `json:"encoding"`
	Status         Status           `json:"status"`
	Progress       float64          `json:"progress"`
	Stage          string           `json:"stage"`         // Current stage description
	StageProgress  float64          `json:"stageProgress"` // Progress within current stage
	FileInfo       *models.FileInfo `json:"fileInfo,omitempty"`
	Error          string           `json:"error,omitempty"`
	CreatedAt      time.Time        `json:"createdAt"`
	CompletedAt    *time.Time       `json:"completedAt,omitempty"`
}

// Manager handles async upload processing.
type Manager struct {
	jobs      map[string]*Job
	mu        sync.RWMutex
	uploadDir string
	store     Store
}

// Store defines the interface needed from storage layer.
type Store interface {
	CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error)
	GetFilePath(id string) (string, error)
	RegisterFile(info *models.FileInfo)
}

// NewManager creates a new upload processing manager.
func NewManager(uploadDir string, store Store) *Manager {
	return &Manager{
		jobs:      make(map[string]*Job),
		uploadDir: uploadDir,
		store:     store,
	}
}

// StartJob begins async processing of an upload.
func (m *Manager) StartJob(uploadID, fileName string, totalChunks int, originalSize, compressedSize int64, encoding string) *Job {
	job := &Job{
		ID:             uuid.New().String(),
		UploadID:       uploadID,
		FileName:       fileName,
		TotalChunks:    totalChunks,
		OriginalSize:   originalSize,
		CompressedSize: compressedSize,
		Encoding:       encoding,
		Status:         StatusProcessing,
		Progress:       0,
		Stage:          "preparing",
		StageProgress:  0,
		CreatedAt:      time.Now(),
	}

	m.mu.Lock()
	m.jobs[job.ID] = job
	m.mu.Unlock()

	// Start async processing
	go m.processJob(job)

	return job
}

// GetJob retrieves a job by ID.
func (m *Manager) GetJob(id string) (*Job, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	job, ok := m.jobs[id]
	return job, ok
}

// processJob handles the actual async processing.
func (m *Manager) processJob(job *Job) {
	fmt.Printf("[UploadJob %s] Starting processing: %s\n", job.ID[:8], job.FileName)

	// Stage 1: Assemble chunks
	m.updateJobStatus(job, StatusAssembling, "assembling chunks", 0)

	info, err := m.store.CompleteChunkedUpload(job.UploadID, job.FileName, job.TotalChunks)
	if err != nil {
		m.markJobError(job, fmt.Sprintf("failed to assemble chunks: %v", err))
		return
	}

	m.updateJobStatus(job, StatusAssembling, "assembling chunks", 100)
	fmt.Printf("[UploadJob %s] Chunks assembled: %s (%d bytes)\n", job.ID[:8], info.ID, info.Size)

	// Stage 2: Decompress if needed
	if job.Encoding == "gzip" || job.Encoding == "binary-gzip" {
		m.updateJobStatus(job, StatusDecompressing, "decompressing file", 0)

		fmt.Printf("[UploadJob %s] Decompressing file %s (compressed: %d bytes, expected: %d bytes)\n",
			job.ID[:8], info.ID, info.Size, job.OriginalSize)

		if err := m.decompressFileWithProgress(job, info.ID); err != nil {
			// Log error but don't fail - file might still be parseable
			fmt.Printf("[UploadJob %s] Warning: failed to decompress file %s: %v\n", job.ID[:8], info.ID, err)
			// Continue with the file as-is
		} else {
			// Update size after decompression and re-register with store
			info.Size = job.OriginalSize
			m.store.RegisterFile(info)
			fmt.Printf("[UploadJob %s] Successfully decompressed file %s\n", job.ID[:8], info.ID)
		}

		m.updateJobStatus(job, StatusDecompressing, "decompressing file", 100)
	}

	// Complete
	job.FileInfo = info
	m.markJobComplete(job)
	fmt.Printf("[UploadJob %s] Processing complete: %s (%d bytes)\n", job.ID[:8], info.ID, info.Size)
}

// decompressFileWithProgress decompresses a gzip file with progress tracking.
func (m *Manager) decompressFileWithProgress(job *Job, fileID string) error {
	path, err := m.store.GetFilePath(fileID)
	if err != nil {
		return err
	}

	// Open compressed file
	compressedFile, err := os.Open(path)
	if err != nil {
		return err
	}
	defer compressedFile.Close()

	// Check gzip magic
	magic := make([]byte, 2)
	if _, err := compressedFile.Read(magic); err != nil {
		return err
	}
	if magic[0] != 0x1f || magic[1] != 0x8b {
		return fmt.Errorf("not a gzip file")
	}

	// Reset to beginning
	compressedFile.Seek(0, 0)

	// Create gzip reader
	reader, err := gzip.NewReader(compressedFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	// Create temp file for decompressed data
	tempPath := path + ".decompressing"
	outFile, err := os.Create(tempPath)
	if err != nil {
		return err
	}

	// Stream decompress with progress updates
	buf := make([]byte, 1024*1024) // 1MB buffer
	var written int64
	lastProgressUpdate := time.Now()

	for {
		n, readErr := reader.Read(buf)
		if n > 0 {
			_, writeErr := outFile.Write(buf[:n])
			if writeErr != nil {
				outFile.Close()
				os.Remove(tempPath)
				return fmt.Errorf("write error: %w", writeErr)
			}
			written += int64(n)

			// Update progress every 100ms
			if time.Since(lastProgressUpdate) > 100*time.Millisecond {
				// Calculate progress based on decompressed bytes written
				progress := float64(written) / float64(job.OriginalSize) * 100
				if progress > 99 {
					progress = 99
				}
				m.updateJobStatus(job, StatusDecompressing, "decompressing file", progress)
				lastProgressUpdate = time.Now()
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				outFile.Close()
				os.Remove(tempPath)
				return fmt.Errorf("read error: %w", readErr)
			}
			break
		}
	}

	outFile.Close()

	// Validate decompressed size matches expected original size
	if written != job.OriginalSize {
		os.Remove(tempPath)
		return fmt.Errorf("decompressed size mismatch: got %d bytes, expected %d bytes", written, job.OriginalSize)
	}

	// Replace original with decompressed
	if err := os.Rename(tempPath, path); err != nil {
		os.Remove(tempPath)
		return err
	}

	return nil
}

// updateJobStatus updates job progress (thread-safe).
func (m *Manager) updateJobStatus(job *Job, status Status, stage string, stageProgress float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job.Status = status
	job.Stage = stage
	job.StageProgress = stageProgress

	// Calculate overall progress
	// Assembling: 0-40%, Decompressing: 40-90%, Finalizing: 90-100%
	switch status {
	case StatusAssembling:
		job.Progress = stageProgress * 0.4
	case StatusDecompressing:
		job.Progress = 40 + stageProgress*0.5
	case StatusComplete:
		job.Progress = 100
	}
}

// markJobComplete marks job as complete (thread-safe).
func (m *Manager) markJobComplete(job *Job) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job.Status = StatusComplete
	job.Progress = 100
	now := time.Now()
	job.CompletedAt = &now
}

// markJobError marks job as failed (thread-safe).
func (m *Manager) markJobError(job *Job, errMsg string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job.Status = StatusError
	job.Error = errMsg
	now := time.Now()
	job.CompletedAt = &now
	fmt.Printf("[UploadJob %s] Error: %s\n", job.ID[:8], errMsg)
}

// CleanupOldJobs removes jobs older than the specified duration.
func (m *Manager) CleanupOldJobs(maxAge time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	for id, job := range m.jobs {
		if job.Status == StatusComplete || job.Status == StatusError {
			if job.CompletedAt != nil && job.CompletedAt.Before(cutoff) {
				delete(m.jobs, id)
			}
		}
	}
}
