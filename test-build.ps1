#!/usr/bin/env pwsh
# Quick test script to verify the air-gapped build works

param(
    [int]$TestPort = 18089
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PLC Log Visualizer - Build Test Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageDir = Get-ChildItem -Path (Join-Path $scriptDir "dist") -Filter "plc-visualizer-airgapped-*" -Directory | Select-Object -First 1

if (-not $packageDir) {
    Write-Host "ERROR: No air-gapped package found in dist/" -ForegroundColor Red
    Write-Host "Run build-airgapped.ps1 first" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found package: $($packageDir.Name)" -ForegroundColor Green
Write-Host ""

# Test 1: Check binary exists
$binaryPath = Join-Path $packageDir.FullName "plc-visualizer.exe"
if (-not (Test-Path $binaryPath)) {
    Write-Host "FAIL: Binary not found at expected path" -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Binary exists" -ForegroundColor Green

# Test 2: Check binary can start (quick test)
Write-Host ""
Write-Host "Testing binary startup..." -ForegroundColor Cyan

$env:PORT = $TestPort
$env:DATA_DIR = Join-Path $packageDir.FullName "data"

$process = $null
try {
    $process = Start-Process -FilePath $binaryPath -WorkingDirectory $packageDir.FullName -PassThru -WindowStyle Hidden
    
    # Wait for server to start
    Start-Sleep -Seconds 3
    
    # Test health endpoint
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$TestPort/api/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "[PASS] Health endpoint responding" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Health endpoint returned $($response.StatusCode)" -ForegroundColor Red
        }
    } catch {
        Write-Host "[FAIL] Could not connect to health endpoint: $_" -ForegroundColor Red
    }
    
    # Test frontend serving
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$TestPort/" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200 -and $response.Content -match "PLC Log Visualizer") {
            Write-Host "[PASS] Frontend serving correctly" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Frontend returned status $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[FAIL] Could not retrieve frontend: $_" -ForegroundColor Red
    }
    
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "Server stopped" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
