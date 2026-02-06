# Storage Layer Documentation

This document details the storage architecture, file management, and persistence strategies.

## Overview

The storage layer (`internal/storage/manager.go`) provides a file storage abstraction over the local filesystem with support for:

- **Single file uploads**: Save files directly from memory or streams
- **Chunked uploads**: Temporary chunk storage with atomic assembly
- **File indexing**: In-memory metadata index for fast lookups
- **Thread-safe operations**: RWMutex-protected concurrent access

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Storage Interface                        │
│                                                                 │
│  type Store interface {                                        │
│    Save(name string, r io.Reader) (*FileInfo, error)           │
│    SaveBytes(name string, data []byte) (*FileInfo, error)      │
│    Get(id string) (*FileInfo, error)                            │
│    List(limit int) ([]*FileInfo, error)                        │
│    Delete(id string) error                                      │
│    Rename(id string, newName string) (*FileInfo, error)        │
│    GetFilePath(id string) (string, error)                      │
│    SaveChunk(uploadID string, chunkIndex int, r io.Reader)      │
│    SaveChunkBytes(uploadID string, chunkIndex int, data []byte) │
│    CompleteChunkedUpload(...) (*FileInfo, error)                │
│    RegisterFile(info *FileInfo)                                │
│  }                                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LocalStore Implementation                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    In-Memory Index                         │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ files: map[string]*FileInfo                         │ │  │
│  │  │ - Key: UUID                                          │ │  │
│  │  │ - Value: FileInfo with name, size, status, time     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │          │                                                      │
│  │          │ RWMutex protected                                   │
│  │          ▼                                                      │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Filesystem                              │  │
│  │  uploadDir/                                               │  │
│  │  ├── <uuid1>            # Final file                      │  │
│  │  ├── <uuid2>                                               │  │
│  │  └── chunks/           # Temporary chunk storage          │  │
│  │      └── <uploadId>/                                      │  │
│  │          ├── chunk_0                                      │  │
│  │          └── chunk_1                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## FileInfo Structure

```go
type FileInfo struct {
    ID         string    `json:"id"`          // UUID identifier
    Name       string    `json:"name"`        // Original filename
    Size       int64     `json:"size"`        // File size in bytes
    UploadedAt time.Time `json:"uploadedAt"`  // Upload timestamp
    Status     string    `json:"status"`      // "uploaded", "parsing", etc.
}
```

## Directory Structure

```
data/uploads/
├── 550e8400-e29b-41d4-a716-446655440000    # Log file
├── 660e8400-e29b-41d4-a716-446655440001    # Map layout
├── 770e8400-e29b-41d4-a716-446655440002    # Rules file
└── chunks/
    ├── 880e8400-e29b-41d4-a716-446655440003/
    │   ├── chunk_0
    │   ├── chunk_1
    │   └── chunk_2
    └── 990e8400-e29b-41d4-a716-446655440004/
        └── chunk_0
```

## Key Operations

### Single File Upload

```go
// Save from reader (streaming)
func (s *LocalStore) Save(name string, r io.Reader) (*FileInfo, error) {
    id := uuid.New().String()
    path := filepath.Join(s.uploadDir, id)

    f, err := os.Create(path)
    if err != nil {
        return nil, fmt.Errorf("creating file: %w", err)
    }
    defer f.Close()

    // Stream directly to disk
    size, err := io.Copy(f, r)
    if err != nil {
        os.Remove(path)
        return nil, fmt.Errorf("writing file: %w", err)
    }

    info := &FileInfo{
        ID:         id,
        Name:       name,
        Size:       size,
        UploadedAt: time.Now(),
        Status:     "uploaded",
    }

    // Thread-safe index update
    s.mu.Lock()
    s.files[id] = info
    s.mu.Unlock()

    return info, nil
}

// Save from bytes (small files)
func (s *LocalStore) SaveBytes(name string, data []byte) (*FileInfo, error) {
    id := uuid.New().String()
    path := filepath.Join(s.uploadDir, id)

    if err := os.WriteFile(path, data, 0644); err != nil {
        return nil, fmt.Errorf("writing file: %w", err)
    }

    return &FileInfo{
        ID:         id,
        Name:       name,
        Size:       int64(len(data)),
        UploadedAt: time.Now(),
        Status:     "uploaded",
    }, nil
}
```

### Chunk Management

```go
// Save individual chunk
func (s *LocalStore) SaveChunk(uploadID string, chunkIndex int, r io.Reader) error {
    chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
    
    // Create directory (idempotent)
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

// Assemble chunks into final file
func (s *LocalStore) CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*FileInfo, error) {
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

    // Cleanup chunks immediately
    os.RemoveAll(chunkDir)

    info := &FileInfo{
        ID:         id,
        Name:       name,
        Size:       totalSize,
        UploadedAt: time.Now(),
        Status:     "uploaded",
    }

    s.mu.Lock()
    s.files[id] = info
    s.mu.Unlock()

    return info, nil
}
```

### File Listing with Sorting

```go
func (s *LocalStore) List(limit int) ([]*FileInfo, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    var list []*FileInfo
    for _, info := range s.files {
        list = append(list, info)
    }

    // Sort by UploadedAt descending (newest first)
    sort.Slice(list, func(i, j int) bool {
        return list[i].UploadedAt.After(list[j].UploadedAt)
    })

    if len(list) > limit {
        list = list[:limit]
    }

    return list, nil
}
```

## Thread Safety

The storage manager uses RWMutex for concurrent access:

```go
type LocalStore struct {
    mu        sync.RWMutex    // Readers: Get, List | Writers: Save, Delete, Rename
    uploadDir string
    files     map[string]*FileInfo
}

// Multiple readers can access simultaneously
func (s *LocalStore) Get(id string) (*FileInfo, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    info, ok := s.files[id]
    if !ok {
        return nil, fmt.Errorf("file not found: %s", id)
    }
    return info, nil
}

// Writes are exclusive
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
    return nil
}
```

## Integration with Upload Processing

The storage layer integrates with the async upload processor:

```go
// From upload/manager.go
type Store interface {
    CompleteChunkedUpload(uploadID string, name string, totalChunks int) (*models.FileInfo, error)
    GetFilePath(id string) (string, error)
    RegisterFile(info *models.FileInfo)
}

func (m *Manager) processJob(job *Job) {
    // Assemble chunks
    info, err := m.store.CompleteChunkedUpload(job.UploadID, job.FileName, job.TotalChunks)
    
    // Decompress if needed
    if job.Encoding == "gzip" {
        m.decompressFileWithProgress(job, info.ID)
        
        // Re-register with updated size
        info.Size = job.OriginalSize
        m.store.RegisterFile(info)
    }
}
```

## Memory Considerations

### Why In-Memory Index?

- **Fast lookups**: O(1) file retrieval by UUID
- **Simple**: No database required for file metadata
- **Small footprint**: One FileInfo (~80 bytes) per file

### Scalability

For very large deployments (millions of files), consider:

```go
// Option 1: BoltDB (embedded key-value store)
type LocalStore struct {
    db *bolt.DB
    // ...
}

// Option 2: SQLite
type LocalStore struct {
    db *sql.DB
    // ...
}
```

## Best Practices

### File Cleanup

The system doesn't automatically clean up orphaned files. For production:

```bash
# Cron job to clean old files
# 0 2 * * * find /data/uploads -name "*" -mtime +7 -delete
```

### Permissions

```bash
# Set correct permissions
chmod 755 /data/uploads
chown appuser:appgroup /data/uploads
```

### Monitoring

```go
// Add to List()
func (s *LocalStore) Stats() (fileCount, totalSize int64) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    
    for _, info := range s.files {
        fileCount++
        totalSize += info.Size
    }
    return
}
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload single file (base64) |
| GET | `/api/files/recent` | List recent files (20 log files) |
| GET | `/api/files/:id` | Get file metadata |
| PUT | `/api/files/:id` | Rename file |
| DELETE | `/api/files/:id` | Delete file |
