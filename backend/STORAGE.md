# Storage Layer

Implementation: `backend/internal/storage/manager.go`

## Purpose

Provides local filesystem storage for:
- uploaded files
- temporary chunk data
- in-memory file metadata index

## Store Capabilities

Key operations exposed by `storage.Store`:
- save (`Save`, `SaveBytes`)
- read/list metadata (`Get`, `List`, `GetFilePath`)
- update/delete (`Rename`, `Delete`)
- chunk workflow (`SaveChunk`, `SaveChunkBytes`, `CompleteChunkedUpload`)
- register existing file metadata (`RegisterFile`)

## Filesystem Layout

```text
data/uploads/
├── <file-id>
└── chunks/
    └── <upload-id>/
        ├── chunk_0
        ├── chunk_1
        └── ...
```

## Behavior Notes

- File IDs are UUID-based.
- Chunk directories are assembled then cleaned up during completion.
- Metadata is indexed in memory with mutex protection for concurrent access.
- `List` returns newest uploads first.

## Related Docs

- [UPLOAD_HANDLING.md](./UPLOAD_HANDLING.md)
- [../API.md](../API.md)
