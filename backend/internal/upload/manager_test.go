package upload

import (
	"bytes"
	"compress/gzip"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/plc-visualizer/backend/internal/models"
)

type mockUploadStore struct {
	mu sync.Mutex

	completeFn func(uploadID string, name string, totalChunks int) (*models.FileInfo, error)
	pathFn     func(id string) (string, error)

	completeCalls   int
	lastUploadID    string
	lastFileName    string
	lastTotalChunks int
	registerCalls   []*models.FileInfo
}

func (m *mockUploadStore) CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
	m.mu.Lock()
	m.completeCalls++
	m.lastUploadID = uploadID
	m.lastFileName = name
	m.lastTotalChunks = totalChunks
	fn := m.completeFn
	m.mu.Unlock()

	if fn == nil {
		return nil, errors.New("completeFn not configured")
	}
	return fn(uploadID, name, totalChunks)
}

func (m *mockUploadStore) GetFilePath(id string) (string, error) {
	m.mu.Lock()
	fn := m.pathFn
	m.mu.Unlock()

	if fn == nil {
		return "", errors.New("pathFn not configured")
	}
	return fn(id)
}

func (m *mockUploadStore) RegisterFile(info *models.FileInfo) {
	m.mu.Lock()
	defer m.mu.Unlock()
	copyInfo := *info
	m.registerCalls = append(m.registerCalls, &copyInfo)
}

func waitForTerminalJobState(t *testing.T, m *Manager, jobID string) *Job {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)

	for time.Now().Before(deadline) {
		job, ok := m.GetJob(jobID)
		if ok && (job.Status == StatusComplete || job.Status == StatusError) {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for terminal state for job %q", jobID)
	return nil
}

func writeGzipFile(t *testing.T, path string, content []byte) {
	t.Helper()

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create gzip file: %v", err)
	}

	w := gzip.NewWriter(f)
	if _, err := w.Write(content); err != nil {
		_ = f.Close()
		t.Fatalf("write gzip payload: %v", err)
	}
	if err := w.Close(); err != nil {
		_ = f.Close()
		t.Fatalf("close gzip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close gzip file: %v", err)
	}
}

func TestManagerStartJobCompletesWithoutDecompression(t *testing.T) {
	store := &mockUploadStore{
		completeFn: func(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
			return &models.FileInfo{
				ID:   "file-no-gzip",
				Name: name,
				Size: 42,
			}, nil
		},
	}
	m := NewManager(t.TempDir(), store)

	job := m.StartJob("upload-plain", "plain.log", 2, 0, 0, "")
	done := waitForTerminalJobState(t, m, job.ID)

	if done.Status != StatusComplete {
		t.Fatalf("expected status %q, got %q", StatusComplete, done.Status)
	}
	if done.Progress != 100 {
		t.Fatalf("expected progress 100, got %v", done.Progress)
	}
	if done.FileInfo == nil || done.FileInfo.ID != "file-no-gzip" {
		t.Fatalf("expected file info to be set from store")
	}
	if done.CompletedAt == nil {
		t.Fatalf("expected completed timestamp")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	if store.completeCalls != 1 {
		t.Fatalf("expected 1 complete call, got %d", store.completeCalls)
	}
	if store.lastUploadID != "upload-plain" || store.lastFileName != "plain.log" || store.lastTotalChunks != 2 {
		t.Fatalf("unexpected complete args: uploadID=%q name=%q chunks=%d", store.lastUploadID, store.lastFileName, store.lastTotalChunks)
	}
	if len(store.registerCalls) != 0 {
		t.Fatalf("did not expect register calls for non-gzip flow")
	}
}

func TestManagerStartJobMarksErrorWhenAssembleFails(t *testing.T) {
	store := &mockUploadStore{
		completeFn: func(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
			return nil, errors.New("missing chunk 1")
		},
	}
	m := NewManager(t.TempDir(), store)

	job := m.StartJob("upload-error", "broken.log", 3, 0, 0, "")
	done := waitForTerminalJobState(t, m, job.ID)

	if done.Status != StatusError {
		t.Fatalf("expected status %q, got %q", StatusError, done.Status)
	}
	if done.CompletedAt == nil {
		t.Fatalf("expected completed timestamp to be set on error")
	}
	if !strings.Contains(done.Error, "failed to assemble chunks") {
		t.Fatalf("expected wrapped assemble error, got %q", done.Error)
	}
}

func TestManagerStartJobGzipSuccessRegistersDecompressedSize(t *testing.T) {
	raw := []byte("alpha\nbeta\ngamma\n")
	compressedPath := t.TempDir() + "/compressed.gz"
	writeGzipFile(t, compressedPath, raw)

	store := &mockUploadStore{
		completeFn: func(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
			return &models.FileInfo{
				ID:   "gzip-success-id",
				Name: name,
				Size: 5,
			}, nil
		},
		pathFn: func(id string) (string, error) {
			if id != "gzip-success-id" {
				return "", errors.New("unexpected file id")
			}
			return compressedPath, nil
		},
	}
	m := NewManager(t.TempDir(), store)

	job := m.StartJob("upload-gzip", "test.log", 1, int64(len(raw)), 5, "gzip")
	done := waitForTerminalJobState(t, m, job.ID)

	if done.Status != StatusComplete {
		t.Fatalf("expected status %q, got %q", StatusComplete, done.Status)
	}
	if done.FileInfo == nil || done.FileInfo.Size != int64(len(raw)) {
		t.Fatalf("expected decompressed file size %d, got %+v", len(raw), done.FileInfo)
	}

	store.mu.Lock()
	if len(store.registerCalls) != 1 {
		store.mu.Unlock()
		t.Fatalf("expected one register call, got %d", len(store.registerCalls))
	}
	if store.registerCalls[0].Size != int64(len(raw)) {
		store.mu.Unlock()
		t.Fatalf("expected registered size %d, got %d", len(raw), store.registerCalls[0].Size)
	}
	store.mu.Unlock()

	got, err := os.ReadFile(compressedPath)
	if err != nil {
		t.Fatalf("read decompressed file: %v", err)
	}
	if !bytes.Equal(got, raw) {
		t.Fatalf("decompressed file content mismatch")
	}
}

func TestManagerStartJobGzipFailureStillCompletes(t *testing.T) {
	invalidGzipPath := t.TempDir() + "/not-gzip.bin"
	if err := os.WriteFile(invalidGzipPath, []byte("plain text"), 0644); err != nil {
		t.Fatalf("write invalid gzip fixture: %v", err)
	}

	store := &mockUploadStore{
		completeFn: func(uploadID string, name string, totalChunks int) (*models.FileInfo, error) {
			return &models.FileInfo{
				ID:   "gzip-fail-id",
				Name: name,
				Size: 10,
			}, nil
		},
		pathFn: func(id string) (string, error) {
			return invalidGzipPath, nil
		},
	}
	m := NewManager(t.TempDir(), store)

	job := m.StartJob("upload-gzip-fail", "bad.log", 1, 100, 10, "gzip")
	done := waitForTerminalJobState(t, m, job.ID)

	if done.Status != StatusComplete {
		t.Fatalf("expected status %q despite decompress warning, got %q", StatusComplete, done.Status)
	}
	if done.FileInfo == nil || done.FileInfo.Size != 10 {
		t.Fatalf("expected original assembled size to be retained, got %+v", done.FileInfo)
	}

	store.mu.Lock()
	registerCount := len(store.registerCalls)
	store.mu.Unlock()
	if registerCount != 0 {
		t.Fatalf("did not expect register calls when decompression fails")
	}
}

func TestDecompressFileWithProgressSizeMismatchRemovesTempFile(t *testing.T) {
	raw := []byte("123456789")
	compressedPath := t.TempDir() + "/mismatch.gz"
	writeGzipFile(t, compressedPath, raw)

	store := &mockUploadStore{
		pathFn: func(id string) (string, error) {
			return compressedPath, nil
		},
	}
	m := NewManager(t.TempDir(), store)

	job := &Job{
		ID:           "job-12345678",
		OriginalSize: int64(len(raw) + 5),
	}

	err := m.decompressFileWithProgress(job, "any-id")
	if err == nil || !strings.Contains(err.Error(), "decompressed size mismatch") {
		t.Fatalf("expected size mismatch error, got %v", err)
	}
	if _, statErr := os.Stat(compressedPath + ".decompressing"); !os.IsNotExist(statErr) {
		t.Fatalf("expected temp decompression file to be removed, stat err=%v", statErr)
	}
}

func TestUpdateJobStatusProgressMapping(t *testing.T) {
	m := NewManager(t.TempDir(), &mockUploadStore{})
	job := &Job{ID: "job-status-1"}

	m.updateJobStatus(job, StatusAssembling, "assembling chunks", 50)
	if job.Progress != 20 {
		t.Fatalf("expected assembling progress 20, got %v", job.Progress)
	}
	if job.Stage != "assembling chunks" || job.StageProgress != 50 {
		t.Fatalf("unexpected assembling stage values: %q / %v", job.Stage, job.StageProgress)
	}

	m.updateJobStatus(job, StatusDecompressing, "decompressing file", 20)
	if job.Progress != 50 {
		t.Fatalf("expected decompressing progress 50, got %v", job.Progress)
	}

	m.updateJobStatus(job, StatusComplete, "done", 100)
	if job.Progress != 100 {
		t.Fatalf("expected complete progress 100, got %v", job.Progress)
	}
}

func TestCleanupOldJobsRemovesOnlyCompletedOrErroredPastCutoff(t *testing.T) {
	m := NewManager(t.TempDir(), &mockUploadStore{})
	now := time.Now()
	old := now.Add(-2 * time.Hour)
	recent := now.Add(-10 * time.Minute)

	m.jobs["old-complete"] = &Job{ID: "old-complete", Status: StatusComplete, CompletedAt: &old}
	m.jobs["old-error"] = &Job{ID: "old-error", Status: StatusError, CompletedAt: &old}
	m.jobs["recent-complete"] = &Job{ID: "recent-complete", Status: StatusComplete, CompletedAt: &recent}
	m.jobs["processing-old"] = &Job{ID: "processing-old", Status: StatusProcessing, CompletedAt: &old}

	m.CleanupOldJobs(1 * time.Hour)

	if _, ok := m.jobs["old-complete"]; ok {
		t.Fatalf("expected old complete job to be removed")
	}
	if _, ok := m.jobs["old-error"]; ok {
		t.Fatalf("expected old error job to be removed")
	}
	if _, ok := m.jobs["recent-complete"]; !ok {
		t.Fatalf("expected recent complete job to remain")
	}
	if _, ok := m.jobs["processing-old"]; !ok {
		t.Fatalf("expected processing job to remain")
	}
}
