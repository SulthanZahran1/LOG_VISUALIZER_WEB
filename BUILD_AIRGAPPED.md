# Air-Gapped Build Guide

Build a single executable containing backend + embedded frontend for offline deployment.

## Requirements

Build machine:
- Windows 10/11
- Go 1.24+
- Node.js 20+

Target machine:
- Windows 10/11
- no internet required

## Quick Build

```powershell
cd web_version
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
- standalone executable
- deployment folder
- optional zip bundle

## Runtime Configuration

Config file: `PLCLogVisualizer.exe.config`

Major sections:
- `Server`
- `Storage`
- `Processing`
- `Security`
- `Advanced`

Optional env overrides:
- `PORT`
- `DATA_DIR`
- `DUCKDB_TEMP_DIR`

## Deployment Steps

1. Copy the generated folder to the target machine.
2. Edit `PLCLogVisualizer.exe.config` if needed.
3. Start the app (`start.bat` or executable).
4. Open browser at configured host/port (default `http://localhost:8089`).

## Offline Build (No Internet on Build Host)

1. On a connected machine:
   - run `npm ci` in `frontend/`
   - run `go mod vendor` in `backend/`
   - transfer project to offline build host
2. On offline host:
   - run `.\build-airgapped.ps1 -SkipDeps`

## Implementation Pointers

- Embedded frontend serving: `backend/internal/web`
- Startup + config loading: `backend/cmd/server/main.go`
- Build script: `build-airgapped.ps1`
