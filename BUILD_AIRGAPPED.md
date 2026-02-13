# Air-Gapped Build Guide

This guide explains how to build the CIM Visualizer into a single executable that works completely offline without any internet access.

## Overview

The air-gapped build process:
1. Builds the frontend (Preact/Vite) to static files
2. Embeds those static files into the Go binary using `//go:embed`
3. Produces a single `.exe` file that contains both the backend and frontend
4. Creates a distribution package with XML-based configuration

## Configuration (XML-Based)

All configuration is centralized in **`PLCLogVisualizer.exe.config`** (XML format):

```xml
<PLCLogVisualizer>
  <Server>
    <Port>8089</Port>
    <BindAddress>0.0.0.0</BindAddress>
    <EnableCORS>true</EnableCORS>
    <AllowOrigins>*</AllowOrigins>
    <BodyLimit>2G</BodyLimit>
    <!-- ... -->
  </Server>
  <Storage>
    <DataDirectory>./data</DataDirectory>
    <MaxUploadSize>2G</MaxUploadSize>
    <!-- ... -->
  </Storage>
  <!-- ... -->
</PLCLogVisualizer>
```

### Configuration Sections

| Section | Description |
|---------|-------------|
| `Server` | HTTP server settings (port, timeouts, CORS) |
| `Storage` | File storage paths and limits |
| `Processing` | Parse processing settings (concurrency, compression) |
| `Security` | Authentication and file deletion permissions |
| `Advanced` | Logging, DuckDB tuning, WebSocket settings |

### Environment Variable Overrides (Optional)

While XML config is preferred, these environment variables still work for quick overrides:

- `PORT` - Override server port
- `DATA_DIR` - Override data directory
- `DUCKDB_TEMP_DIR` - Override temp directory

## Requirements

### Build Machine (needs internet ONCE)
- Windows 10/11 (64-bit)
- Node.js 18+ with npm
- Go 1.21+ with CGO enabled

### Target Machine (air-gapped)
- Windows 10/11 (64-bit)
- No internet required
- No additional software installation

## Quick Build

```powershell
# Navigate to web_version directory
cd web_version

# Run the build script
.\build-airgapped.ps1

# With custom default port
.\build-airgapped.ps1 -Port 3000

# With compression
.\build-airgapped.ps1 -Compress
```

The output will be in `dist/`:
- `plc-visualizer_windows_amd64_YYYYMMDD.exe` - The standalone executable
- `plc-visualizer-airgapped-YYYYMMDD/` - Full distribution package with XML config
- `plc-visualizer-airgapped-YYYYMMDD.zip` - Zipped package (if -Compress used)

## Build Options

```powershell
# Custom output directory
.\build-airgapped.ps1 -OutputDir C:\Builds

# Skip dependency installation (if already cached)
.\build-airgapped.ps1 -SkipDeps

# Skip frontend build (if already built)
.\build-airgapped.ps1 -SkipFrontend

# Build for different architecture
.\build-airgapped.ps1 -Architecture arm64

# Set default port in config
.\build-airgapped.ps1 -Port 8080

# All options combined
.\build-airgapped.ps1 -OutputDir C:\Builds -Compress -Architecture amd64 -Port 3000

# Regenerate only the config file
.\build-airgapped.ps1 -ConfigOnly
```

## Offline/Air-Gapped Build Process

If your build machine is also air-gapped, you need to prepare dependencies first:

### Step 1: On a machine WITH internet

```powershell
# Clone/download the repository
cd web_version

# Install and cache frontend dependencies
cd frontend
npm ci

# Go back and vendor Go dependencies
cd ..\backend
go mod vendor

# Now copy the entire project to the air-gapped build machine
```

### Step 2: On the air-gapped build machine

```powershell
cd web_version

# Build using cached dependencies
.\build-airgapped.ps1 -SkipDeps
```

## Deployment

### Distribution Package Structure

```
plc-visualizer-airgapped-YYYYMMDD/
├── plc-visualizer.exe              # Main executable
├── PLCLogVisualizer.exe.config     # XML configuration file ⭐
├── start.bat                       # Easy launcher script
├── edit-config.bat                 # Config editor helper
├── README.txt                      # User documentation
└── data/                           # Data storage
    ├── uploads/                    # Uploaded files
    ├── temp/                       # Temporary data
    ├── parsed/                     # Persisted parsed data
    └── defaults/                   # Default rules/maps
```

### Quick Deploy

1. Copy the entire folder to the target machine
2. (Optional) Edit `PLCLogVisualizer.exe.config` to customize settings
3. Run `start.bat`
4. Open browser to `http://localhost:8089`

### Changing Configuration After Deployment

```powershell
# Option 1: Use the helper script
edit-config.bat

# Option 2: Edit directly
notepad PLCLogVisualizer.exe.config
```

Changes take effect on next server restart.

## How It Works

### Frontend Embedding

The Go code uses the `embed` package to include frontend files:

```go
//go:embed dist/*
var staticFiles embed.FS
```

At runtime, the server checks if embedded files exist:
- **Development**: Files not embedded, API only, separate frontend dev server
- **Production**: Files embedded, serves them directly from binary

### Configuration Loading

1. Server starts and looks for `PLCLogVisualizer.exe.config` in the same directory
2. If not found, creates a default config file
3. Parses XML configuration into structured Go types
4. Applies any environment variable overrides
5. Resolves relative paths to absolute paths
6. Creates necessary directories

### Request Routing

```
Client Request
    │
    ├── /api/* ────────► API handlers (Go)
    ├── /api/ws/* ─────► WebSocket handlers (Go)
    └── /* ────────────► Embedded static files (SPA fallback)
```

### File Size

Typical build sizes:
- Frontend assets: ~500KB - 1MB (gzipped)
- Go binary (without embed): ~25MB
- Go binary (with embed): ~26-27MB
- Final ZIP: ~10-12MB

## Configuration Reference

### Server Section

```xml
<Server>
  <Port>8089</Port>                          <!-- HTTP port -->
  <BindAddress>0.0.0.0</BindAddress>         <!-- 0.0.0.0 = all interfaces -->
  <EnableCORS>true</EnableCORS>              <!-- Enable cross-origin requests -->
  <AllowOrigins>*</AllowOrigins>             <!-- * = all, or comma-separated list -->
  <ReadTimeoutSeconds>30</ReadTimeoutSeconds>
  <WriteTimeoutSeconds>30</WriteTimeoutSeconds>
  <IdleTimeoutSeconds>120</IdleTimeoutSeconds>
  <BodyLimit>2G</BodyLimit>                  <!-- Max request size -->
</Server>
```

### Storage Section

```xml
<Storage>
  <DataDirectory>./data</DataDirectory>      <!-- Base data folder -->
  <UploadsDirectory>./data/uploads</UploadsDirectory>
  <TempDirectory>./data/temp</TempDirectory>
  <ParsedDataDirectory>./data/parsed</ParsedDataDirectory>
  <MaxUploadSize>2G</MaxUploadSize>          <!-- Max file upload size -->
  <EnablePersistence>true</EnablePersistence> <!-- Keep parsed files -->
</Storage>
```

### Security Section

```xml
<Security>
  <AllowFileDeletion>true</AllowFileDeletion>  <!-- Allow users to delete files -->
  <RequireAuthentication>false</RequireAuthentication>
  <AuthToken></AuthToken>                      <!-- Token if auth enabled -->
  <AllowedFileTypes>.csv,.log,.txt,.mcs</AllowedFileTypes>
</Security>
```

### Processing Section

```xml
<Processing>
  <MaxConcurrentParses>3</MaxConcurrentParses>
  <SessionTimeoutMinutes>30</SessionTimeoutMinutes>
  <SessionKeepAliveWindowMinutes>5</SessionKeepAliveWindowMinutes>
  <CleanupIntervalMinutes>5</CleanupIntervalMinutes>
  <EnableCompression>true</EnableCompression>
  <CompressionLevel>5</CompressionLevel>      <!-- 1-9 (1=fast, 9=best) -->
  <MaxMemoryPerSession>1GB</MaxMemoryPerSession>
  <EnableDuckDB>true</EnableDuckDB>          <!-- Memory-efficient large file parsing -->
</Processing>
```

## Troubleshooting

### Build Errors

**"node_modules not found"**
```powershell
# Install dependencies first
cd frontend
npm ci
cd ..
.\build-airgapped.ps1 -SkipDeps
```

**"go: module not found"**
```powershell
# Download Go modules first
cd backend
go mod download
cd ..
.\build-airgapped.ps1 -SkipDeps
```

**CGO errors**
Ensure you have a C compiler installed (MinGW-w64 for Windows).

### Runtime Errors

**"Port already in use"**
Edit `PLCLogVisualizer.exe.config` and change the `<Port>` value.

**"Permission denied" to data folder**
- Ensure the executable has write permissions to the `data/` folder
- Or change `DataDirectory` in config to a writable location

**Config file not loading**
- Ensure `PLCLogVisualizer.exe.config` is in the same folder as the `.exe`
- Check that the XML is valid (no syntax errors)
- Look for error messages in the console output

### Missing Embedded Files

If the binary starts but shows no UI:
```powershell
# Check if embedded files are present
.\plc-visualizer.exe 2>&1 | Select-String "embedded"
```

Should show: `Serving embedded frontend from binary`

## Security Considerations

1. **CORS**: In embedded mode, CORS is configurable via XML (`AllowOrigins`)
2. **Authentication**: Set `RequireAuthentication` to `true` and configure `AuthToken`
3. **No TLS**: The server runs HTTP only; for production LAN use, consider a reverse proxy
4. **File uploads**: Limited by `MaxUploadSize` in config (default: 2GB)
5. **Data isolation**: Each deployment uses its own `data/` folder

## Architecture Support

| Architecture | Status | Notes |
|--------------|--------|-------|
| amd64 | ✅ Full support | Default, most common |
| arm64 | ✅ Supported | Windows on ARM |
| 386 | ⚠️ Limited | Not recommended for large files |

Build for different architectures:
```powershell
.\build-airgapped.ps1 -Architecture arm64
```

## Migration from Environment Variables

If you previously used environment variables, migrate to XML config:

| Old Environment Variable | XML Path |
|-------------------------|----------|
| `PORT=8089` | `<Server><Port>8089</Port></Server>` |
| `DATA_DIR=C:\Data` | `<Storage><DataDirectory>C:\Data</DataDirectory></Storage>` |
| `DUCKDB_TEMP_DIR=C:\Temp` | `<Storage><TempDirectory>C:\Temp</TempDirectory></Storage>` |

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build Air-Gapped

on: [push]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: web_version/frontend/package-lock.json
      
      - name: Build
        run: |
          cd web_version
          .\build-airgapped.ps1 -Compress -Port 80
      
      - uses: actions/upload-artifact@v3
        with:
          name: plc-visualizer-airgapped
          path: web_version/dist/*.zip
```

## License & Distribution

The air-gapped build contains:
- Your application code
- Preact (MIT License)
- DuckDB (MIT License)
- Echo framework (MIT License)

Ensure compliance with all dependency licenses when distributing.

---

**Need Help?** Check the XML config comments or examine the build script for detailed logging.
