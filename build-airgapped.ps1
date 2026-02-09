#!/usr/bin/env pwsh
#requires -Version 5.1

<#
.SYNOPSIS
    Build script for air-gapped PLC Log Visualizer deployment.
    
.DESCRIPTION
    This script builds the frontend, embeds it into the Go binary,
    and creates a self-contained executable that works without internet access.
    
    Configuration is centralized in PLCLogVisualizer.exe.config (XML format).
    
.PARAMETER OutputDir
    Directory where the built executable will be placed. Default: ./dist
    
.PARAMETER SkipFrontend
    Skip building the frontend (useful if already built).
    
.PARAMETER SkipDeps
    Skip dependency installation (npm install, go mod download).
    
.PARAMETER Architecture
    Target architecture: amd64, arm64, or 386. Default: amd64
    
.PARAMETER Compress
    Create a ZIP archive of the distribution package.
    
.PARAMETER Port
    Default port for the configuration file. Default: 8089
    
.PARAMETER ConfigOnly
    Only regenerate the configuration file (for updating existing deployments).
    
.EXAMPLE
    .\build-airgapped.ps1
    
.EXAMPLE
    .\build-airgapped.ps1 -OutputDir C:\PLC-Visualizer -Architecture arm64 -Port 3000
    
.EXAMPLE
    .\build-airgapped.ps1 -Compress -ConfigOnly
#>

[CmdletBinding()]
param(
    [string]$OutputDir = "./dist",
    [switch]$SkipFrontend,
    [switch]$SkipDeps,
    [ValidateSet("amd64", "arm64", "386")]
    [string]$Architecture = "amd64",
    [switch]$Compress,
    [int]$Port = 8089,
    [switch]$ConfigOnly
)

$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Success = "Green"
    Info = "Cyan"
    Warning = "Yellow"
    Error = "Red"
}

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    
    # Normalize the type and get color with fallback
    $typeKey = $Type.Substring(0,1).ToUpper() + $Type.Substring(1).ToLower()
    $color = $Colors[$typeKey]
    
    # Fallback to White if color not found
    if (-not $color) {
        $color = "White"
    }
    
    Write-Host "[$typeKey] $Message" -ForegroundColor $color
}

function Test-Command {
    param([string]$Command)
    return [bool](Get-Command -Name $Command -ErrorAction SilentlyContinue)
}

function Get-NodeVersion {
    try {
        $version = node --version 2>$null
        return $version
    } catch {
        return $null
    }
}

function Get-GoVersion {
    try {
        $version = go version 2>$null
        return $version
    } catch {
        return $null
    }
}

function New-DefaultConfig {
    param(
        [string]$OutputPath,
        [int]$DefaultPort = 8089
    )
    
    $configContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<!--
  PLC Log Visualizer Configuration File
  
  This is the centralized configuration for the air-gapped PLC Log Visualizer.
  Edit this file to customize server behavior without using environment variables.
  
  Changes take effect on next server restart.
-->
<PLCLogVisualizer>
  <!-- Server Configuration -->
  <Server>
    <!-- HTTP server port (default: $DefaultPort) -->
    <Port>$DefaultPort</Port>
    
    <!-- Bind address: 0.0.0.0 for all interfaces, 127.0.0.1 for localhost only -->
    <BindAddress>0.0.0.0</BindAddress>
    
    <!-- Enable CORS (Cross-Origin Resource Sharing) -->
    <EnableCORS>true</EnableCORS>
    
    <!-- Allowed origins for CORS (use * for all, or comma-separated list) -->
    <AllowOrigins>*</AllowOrigins>
    
    <!-- Timeout settings (in seconds) -->
    <ReadTimeoutSeconds>30</ReadTimeoutSeconds>
    <WriteTimeoutSeconds>30</WriteTimeoutSeconds>
    <IdleTimeoutSeconds>120</IdleTimeoutSeconds>
    
    <!-- Maximum request body size (e.g., 2G, 500M, 1048576) -->
    <BodyLimit>2G</BodyLimit>
  </Server>
  
  <!-- Storage Configuration -->
  <Storage>
    <!-- Base data directory (relative to .exe location or absolute path) -->
    <DataDirectory>./data</DataDirectory>
    
    <!-- Subdirectories (relative to DataDirectory or absolute paths) -->
    <UploadsDirectory>./data/uploads</UploadsDirectory>
    <TempDirectory>./data/temp</TempDirectory>
    <ParsedDataDirectory>./data/parsed</ParsedDataDirectory>
    
    <!-- Maximum upload file size -->
    <MaxUploadSize>2G</MaxUploadSize>
    
    <!-- Enable persistent storage of parsed files -->
    <EnablePersistence>true</EnablePersistence>
  </Storage>
  
  <!-- Processing Configuration -->
  <Processing>
    <!-- Maximum concurrent parse operations -->
    <MaxConcurrentParses>3</MaxConcurrentParses>
    
    <!-- Session timeout in minutes (inactive sessions are cleaned up) -->
    <SessionTimeoutMinutes>30</SessionTimeoutMinutes>
    
    <!-- Cleanup interval in minutes (how often to check for expired sessions) -->
    <CleanupIntervalMinutes>5</CleanupIntervalMinutes>
    
    <!-- Enable gzip compression for API responses -->
    <EnableCompression>true</EnableCompression>
    
    <!-- Compression level: 1-9 (1=fast, 9=best compression) -->
    <CompressionLevel>5</CompressionLevel>
    
    <!-- Maximum memory per DuckDB session -->
    <MaxMemoryPerSession>1GB</MaxMemoryPerSession>
  </Processing>
  
  <!-- Security Configuration -->
  <Security>
    <!-- Allow users to delete uploaded files -->
    <AllowFileDeletion>true</AllowFileDeletion>
    
    <!-- Require authentication token for API access -->
    <RequireAuthentication>false</RequireAuthentication>
    
    <!-- Authentication token (only used if RequireAuthentication is true) -->
    <AuthToken></AuthToken>
    
    <!-- Allowed file extensions for upload (comma-separated) -->
    <AllowedFileTypes>.csv,.log,.txt,.mcs,.xml,.yaml,.yml,.gz,.zip</AllowedFileTypes>
  </Security>
  
  <!-- Advanced Configuration -->
  <Advanced>
    <!-- Log level: debug, info, warn, error -->
    <LogLevel>info</LogLevel>
    
    <!-- Enable HTTP request logging -->
    <EnableRequestLogging>true</EnableRequestLogging>
    
    <!-- Number of DuckDB threads (0 = auto) -->
    <DuckDBThreads>4</DuckDBThreads>
    
    <!-- DuckDB memory limit per connection -->
    <DuckDBMemoryLimit>1GB</DuckDBMemoryLimit>
    
    <!-- WebSocket maximum message size in KB -->
    <WebSocketMaxMessageSizeKB>65536</WebSocketMaxMessageSizeKB>
  </Advanced>
</PLCLogVisualizer>
"@
    
    $configContent | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Status "Created configuration file: $OutputPath" "Success"
}

# ============================================
# Config Only Mode
# ============================================
if ($ConfigOnly) {
    Write-Status "Configuration-only mode" "Info"
    
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $configPath = Join-Path $scriptDir "PLCLogVisualizer.exe.config"
    
    New-DefaultConfig -OutputPath $configPath -DefaultPort $Port
    
    Write-Host ""
    Write-Status "Configuration file regenerated" "Success"
    Write-Host "Location: $configPath" -ForegroundColor Cyan
    exit 0
}

# ============================================
# Pre-flight Checks
# ============================================
Write-Status "Starting Air-Gapped Build for PLC Log Visualizer" "Info"
Write-Status "Target Architecture: $Architecture" "Info"
Write-Status "Default Port: $Port" "Info"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $scriptDir "frontend"
$backendDir = Join-Path $scriptDir "backend"
$webDir = Join-Path $backendDir "internal/web"

# Check Node.js
Write-Status "Checking prerequisites..." "Info"
if (-not (Test-Command "node")) {
    Write-Status "Node.js is not installed or not in PATH" "Error"
    Write-Host ""
    Write-Host "Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or if you have an offline Node.js installer, install it and re-run this script." -ForegroundColor Gray
    exit 1
}

$nodeVersion = Get-NodeVersion
Write-Status "Node.js version: $nodeVersion" "Success"

# Check npm
if (-not (Test-Command "npm")) {
    Write-Status "npm is not installed or not in PATH" "Error"
    exit 1
}

# Check Go
if (-not (Test-Command "go")) {
    Write-Status "Go is not installed or not in PATH" "Error"
    Write-Host ""
    Write-Host "Please install Go 1.21+ from https://golang.org/dl/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$goVersion = Get-GoVersion
Write-Status "Go version: $goVersion" "Success"

# Check for C compiler (GCC) - Required for CGO/DuckDB
Write-Status "Checking for C compiler (GCC)..." "Info"
$gcc = Get-Command "gcc" -ErrorAction SilentlyContinue
if (-not $gcc) {
    Write-Status "GCC (C compiler) not found in PATH" "Error"
    Write-Host ""
    Write-Host "This build requires a C compiler for DuckDB support." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Install one of the following:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Option 1: MinGW-w64 (Recommended)" -ForegroundColor White
    Write-Host "    - Download from: https://www.mingw-w64.org/downloads/" -ForegroundColor Gray
    Write-Host "    - Or install via Chocolatey: choco install mingw" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Option 2: TDM-GCC" -ForegroundColor White
    Write-Host "    - Download from: https://jmeubank.github.io/tdm-gcc/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Option 3: MSYS2" -ForegroundColor White
    Write-Host "    - Install MSYS2 and run: pacman -S mingw-w64-x86_64-gcc" -ForegroundColor Gray
    Write-Host ""
    Write-Host "After installation, ensure gcc.exe is in your PATH." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$gccVersion = & gcc --version 2>$null | Select-Object -First 1
Write-Status "C compiler found: $gccVersion" "Success"

# Verify node_modules exists or install
$nodeModulesDir = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    if ($SkipDeps) {
        Write-Status "node_modules not found but -SkipDeps specified" "Error"
        Write-Host "Run without -SkipDeps to install dependencies first." -ForegroundColor Yellow
        exit 1
    }
}

# Create output directory
$OutputDir = Resolve-Path (Join-Path $scriptDir $OutputDir) -ErrorAction SilentlyContinue
if (-not $OutputDir) {
    New-Item -ItemType Directory -Path (Join-Path $scriptDir $OutputDir) -Force | Out-Null
    $OutputDir = Resolve-Path (Join-Path $scriptDir $OutputDir)
}
Write-Status "Output directory: $OutputDir" "Info"

# ============================================
# Build Frontend
# ============================================
if (-not $SkipFrontend) {
    Write-Status "Building frontend..." "Info"
    
    Push-Location $frontendDir
    
    try {
        # Install dependencies
        if (-not $SkipDeps) {
            Write-Status "Installing npm dependencies..." "Info"
            
            # Check if node_modules exists (for offline builds)
            if (-not (Test-Path "node_modules")) {
                Write-Status "Installing npm dependencies (this may take a while)..." "Info"
                npm ci --prefer-offline --no-audit --progress=false
                if ($LASTEXITCODE -ne 0) {
                    Write-Status "Failed to install npm dependencies" "Error"
                    Write-Host ""
                    Write-Host "If you're in an air-gapped environment, ensure node_modules is pre-populated." -ForegroundColor Yellow
                    exit 1
                }
            } else {
                Write-Status "node_modules exists, skipping npm ci (use -SkipDeps to skip this check)" "Info"
            }
        }
        
        # Build frontend
        Write-Status "Building frontend for production..." "Info"
        $env:NODE_ENV = "production"
        
        # Run build
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Status "Frontend build failed" "Error"
            exit 1
        }
        
        Write-Status "Frontend built successfully" "Success"
        
    } finally {
        Pop-Location
    }
    
    # Copy built files to embed directory
    $distDir = Join-Path $frontendDir "dist"
    $embedDir = Join-Path $webDir "dist"
    
    if (-not (Test-Path $distDir)) {
        Write-Status "Frontend dist directory not found at $distDir" "Error"
        exit 1
    }
    
    # Clean and recreate embed directory
    if (Test-Path $embedDir) {
        Write-Status "Cleaning old embed directory..." "Info"
        Remove-Item -Recurse -Force $embedDir
    }
    
    Write-Status "Copying frontend assets to embed directory..." "Info"
    Copy-Item -Recurse -Path $distDir -Destination $embedDir
    
    # Verify the copy
    $indexFile = Join-Path $embedDir "index.html"
    if (-not (Test-Path $indexFile)) {
        Write-Status "index.html not found after copy" "Error"
        exit 1
    }
    
    $fileCount = (Get-ChildItem -Recurse $embedDir | Measure-Object).Count
    Write-Status "Copied $fileCount files to embed directory" "Success"
    
} else {
    Write-Status "Skipping frontend build (using existing)" "Warning"
}

# Verify embed directory exists
$embedDistDir = Join-Path $webDir "dist"
if (-not (Test-Path $embedDistDir)) {
    Write-Status "Frontend build not found at $embedDistDir" "Error"
    Write-Host "Run without -SkipFrontend to build the frontend first." -ForegroundColor Yellow
    exit 1
}

Write-Status "Frontend assets ready for embedding" "Success"

# ============================================
# Build Go Binary
# ============================================
Write-Status "Building Go binary..." "Info"

Push-Location $backendDir

try {
    # Download Go dependencies
    if (-not $SkipDeps) {
        # Check if vendor directory exists (for offline builds)
        if (-not (Test-Path "vendor")) {
            Write-Status "Downloading Go dependencies..." "Info"
            go mod download
            if ($LASTEXITCODE -ne 0) {
                Write-Status "Failed to download Go dependencies" "Error"
                Write-Host ""
                Write-Host "If you're in an air-gapped environment, run 'go mod vendor' beforehand." -ForegroundColor Yellow
                exit 1
            }
        } else {
            Write-Status "vendor/ directory exists, using vendored dependencies" "Info"
        }
    }
    
    # Determine output filename
    $timestamp = Get-Date -Format 'yyyyMMdd'
    $outputFile = "plc-visualizer_windows_${Architecture}_${timestamp}.exe"
    $outputPath = Join-Path $OutputDir $outputFile
    
    # Clean previous build
    if (Test-Path $outputPath) {
        Remove-Item -Force $outputPath
    }
    
    # Build the binary
    Write-Status "Compiling binary: $outputFile..." "Info"
    
    $env:CGO_ENABLED = "1"
    $env:GOOS = "windows"
    $env:GOARCH = $Architecture
    
    # Build command with version info
    $buildTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $ldflags = "-s -w -X 'main.BuildTime=$buildTime' -X 'main.Version=1.0.0-$timestamp'"
    
    Write-Status "Running: go build -ldflags \"$ldflags\" -o $outputFile" "Info"
    
    & go build -ldflags $ldflags -o $outputPath ./cmd/server
    
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Go build failed" "Error"
        exit 1
    }
    
} finally {
    Pop-Location
}

# Verify the binary was created
if (-not (Test-Path $outputPath)) {
    Write-Status "Binary was not created at expected path: $outputPath" "Error"
    exit 1
}

$fileInfo = Get-Item $outputPath
$sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Status "Binary created: $outputFile ($sizeMB MB)" "Success"

# ============================================
# Create Distribution Package
# ============================================
Write-Status "Creating distribution package..." "Info"

# Create package directory
$packageName = "plc-visualizer-airgapped-${timestamp}"
$packageDir = Join-Path $OutputDir $packageName

if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
New-Item -ItemType Directory -Path $packageDir | Out-Null

# Copy binary with simple name
$binaryDest = Join-Path $packageDir "plc-visualizer.exe"
Copy-Item $outputPath $binaryDest

# Create XML configuration file
$configPath = Join-Path $packageDir "PLCLogVisualizer.exe.config"
New-DefaultConfig -OutputPath $configPath -DefaultPort $Port

# Create data directories
$dataDir = Join-Path $packageDir "data"
New-Item -ItemType Directory -Path (Join-Path $dataDir "uploads") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataDir "temp") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataDir "parsed") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataDir "defaults" "maps") -Force | Out-Null

# Copy default rules if exists
$defaultRules = Join-Path $backendDir "data/defaults/rules.yaml"
if (Test-Path $defaultRules) {
    Copy-Item $defaultRules (Join-Path $dataDir "defaults/rules.yaml")
    Write-Status "Copied default rules.yaml" "Info"
}

# Copy default map if exists
$defaultMap = Join-Path $backendDir "data/defaults/maps/conveyor_layout.xml"
if (Test-Path $defaultMap) {
    Copy-Item $defaultMap (Join-Path $dataDir "defaults/maps/conveyor_layout.xml")
    Write-Status "Copied default map layout" "Info"
}

# Create start script
$startScript = @'
@echo off
chcp 65001 >nul
title PLC Log Visualizer
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║           PLC Log Visualizer - Air-Gapped Edition         ║
echo ║                 (No Internet Required)                    ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Starting server...
echo.

REM Configuration is read from PLCLogVisualizer.exe.config
echo Configuration file: PLCLogVisualizer.exe.config
echo.
echo To customize settings, edit the XML configuration file.
echo.

plc-visualizer.exe

echo.
echo Server stopped.
pause
'@

$startScriptPath = Join-Path $packageDir "start.bat"
$startScript | Out-File -FilePath $startScriptPath -Encoding ASCII

# Create config editor helper script
$configEditorScript = @'
@echo off
echo Opening configuration file in Notepad...
echo.
echo Edit PLCLogVisualizer.exe.config to customize server settings.
echo.
notepad "PLCLogVisualizer.exe.config"
echo.
echo Configuration file updated.
echo Changes will take effect on next server start.
pause
'@

$configEditorPath = Join-Path $packageDir "edit-config.bat"
$configEditorScript | Out-File -FilePath $configEditorPath -Encoding ASCII

# Create README
$readmeContent = @"
PLC Log Visualizer - Air-Gapped Edition
========================================

A self-contained build that works completely offline - no internet connection required.

QUICK START
-----------
1. Double-click 'start.bat' to start the server
2. Open your browser to: http://localhost:$Port
3. Start using the application!

CONFIGURATION
-------------
All settings are centralized in: PLCLogVisualizer.exe.config

To customize:
1. Run 'edit-config.bat' (opens in Notepad)
2. Modify the XML settings
3. Save and restart the server

Key settings:
- Server/Port: Change the HTTP port (default: $Port)
- Storage/DataDirectory: Change data location
- Security/RequireAuthentication: Enable API token auth
- Processing/MaxMemoryPerSession: Tune memory usage

DATA STORAGE
------------
All data is stored locally in the 'data/' folder:
- data/uploads/    - Uploaded log files
- data/temp/       - Temporary session data  
- data/parsed/     - Persisted parsed data
- data/defaults/   - Default map and rule files

Your data never leaves this machine.

TROUBLESHOOTING
---------------
* Port already in use?
  Edit PLCLogVisualizer.exe.config and change <Port> value

* Need to reset all data?
  Delete the 'data/' folder and restart

* Binary won't start?
  Ensure you have Windows 10/11 64-bit and Visual C++ Redistributables

* Configuration not loading?
  Ensure PLCLogVisualizer.exe.config is in the same folder as the .exe
  Check that the XML is valid (no syntax errors)

BUILD INFORMATION
-----------------
- Version: 1.0.0-$timestamp
- Architecture: $Architecture
- Build Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- Embedded Frontend: Yes
- Internet Required: No
- Config Format: XML (.exe.config)

For support, please contact your system administrator.
"@

$readmePath = Join-Path $packageDir "README.txt"
$readmeContent | Out-File -FilePath $readmePath -Encoding ASCII

Write-Status "Distribution package created: $packageDir" "Success"

# ============================================
# Create ZIP Archive (Optional)
# ============================================
if ($Compress) {
    $zipPath = Join-Path $OutputDir "$packageName.zip"
    Write-Status "Creating ZIP archive..." "Info"
    
    if (Test-Path $zipPath) {
        Remove-Item -Force $zipPath
    }
    
    try {
        Compress-Archive -Path "$packageDir\*" -DestinationPath $zipPath -Force
        $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
        Write-Status "ZIP archive created: $zipPath ($zipSize MB)" "Success"
    } catch {
        Write-Status "Failed to create ZIP archive: $_" "Warning"
    }
}

# ============================================
# Summary
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output Files:" -ForegroundColor Cyan
Write-Host "  Binary:  $outputPath" -ForegroundColor White
Write-Host "  Package: $packageDir" -ForegroundColor White
Write-Host "  Config:  $configPath" -ForegroundColor White
if ($Compress -and (Test-Path $zipPath)) {
    Write-Host "  ZIP:     $zipPath" -ForegroundColor White
}
Write-Host ""
Write-Host "To test locally:" -ForegroundColor Cyan
Write-Host "  cd '$packageDir'" -ForegroundColor Yellow
Write-Host "  .\start.bat" -ForegroundColor Yellow
Write-Host ""
Write-Host "To customize settings:" -ForegroundColor Cyan
Write-Host "  Edit: $configPath" -ForegroundColor Yellow
Write-Host "  Or run: edit-config.bat" -ForegroundColor Yellow
Write-Host ""
Write-Host "No internet connection required!" -ForegroundColor Green
