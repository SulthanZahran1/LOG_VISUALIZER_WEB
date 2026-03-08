# Air-Gapped Build Guide

Last updated: 2026-03-08

Build a single Windows executable containing the backend and embedded frontend for offline deployment.

## Requirements

Build machine:
- Windows 10/11
- Go 1.24+
- Node.js 20+
- GCC-compatible C compiler for CGO/DuckDB

Target machine:
- Windows 10/11
- no internet required

## Quick Build

Run from the repository root:

```powershell
.\build-airgapped.ps1
```

Common options:
```powershell
.\build-airgapped.ps1 -Port 8089
.\build-airgapped.ps1 -Compress
.\build-airgapped.ps1 -SkipDeps
.\build-airgapped.ps1 -OutputDir C:\Builds
```

## Output

Typical `dist/` artifacts:
- a versioned Windows executable
- a `plc-visualizer-airgapped-YYYYMMDD/` deployment folder
- an optional zip bundle when `-Compress` is used

## Runtime Configuration

Primary config file: `PLCLogVisualizer.exe.config`, placed next to the built executable.

XML sections:
- `Server`
- `Storage`
- `Processing`
- `Security`
- `Advanced`

Current backend environment knobs read by code:
- `DUCKDB_TEMP_DIR`
- `PARSED_DB_DIR`

`PORT` and `DATA_DIR` are not read by the current backend code; use the XML file for those settings.

## Deployment Steps

1. Copy the generated deployment folder to the target machine.
2. Edit `PLCLogVisualizer.exe.config` if needed.
3. Start `plc-visualizer.exe`.
4. Open the configured host/port, default `http://localhost:8089`.

## Offline Build

1. On a connected machine:
   - run `npm ci` in `frontend/`
   - run `go mod vendor` in `backend/`
   - transfer the repo to the offline build host
2. On the offline host:
   - run `.\build-airgapped.ps1 -SkipDeps`

## Related Docs

- [README.md](./README.md)
- [backend/README.md](./backend/README.md)
- [API.md](./API.md)
