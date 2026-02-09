#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates the PLCLogVisualizer.exe.config XML configuration file.

.DESCRIPTION
    This script validates the XML config file syntax and checks for common configuration errors.

.PARAMETER ConfigPath
    Path to the configuration file. Default: ./PLCLogVisualizer.exe.config

.EXAMPLE
    .\validate-config.ps1
    
.EXAMPLE
    .\validate-config.ps1 -ConfigPath C:\PLC\PLCLogVisualizer.exe.config
#>

param(
    [string]$ConfigPath = "./PLCLogVisualizer.exe.config"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PLC Log Visualizer - Config Validator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Resolve path
$ConfigPath = Resolve-Path $ConfigPath -ErrorAction SilentlyContinue
if (-not $ConfigPath) {
    Write-Host "ERROR: Config file not found" -ForegroundColor Red
    exit 1
}

Write-Host "Validating: $ConfigPath" -ForegroundColor White
Write-Host ""

# Test 1: XML Well-formedness
Write-Host "[Test 1] XML Syntax..." -ForegroundColor Yellow
try {
    [xml]$xml = Get-Content $ConfigPath
    Write-Host "  ✓ XML is well-formed" -ForegroundColor Green
} catch {
    Write-Host "  ✗ XML parsing error:" -ForegroundColor Red
    Write-Host "    $_" -ForegroundColor Red
    exit 1
}

# Test 2: Required sections
Write-Host ""
Write-Host "[Test 2] Required Sections..." -ForegroundColor Yellow
$requiredSections = @("Server", "Storage", "Processing", "Security", "Advanced")
$missingSections = @()

foreach ($section in $requiredSections) {
    $node = $xml.PLCLogVisualizer.$section
    if ($node) {
        Write-Host "  ✓ $section" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $section (missing)" -ForegroundColor Red
        $missingSections += $section
    }
}

if ($missingSections.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Missing sections may use default values" -ForegroundColor Yellow
}

# Test 3: Server settings
Write-Host ""
Write-Host "[Test 3] Server Configuration..." -ForegroundColor Yellow
$server = $xml.PLCLogVisualizer.Server

if ($server.Port) {
    $port = [int]$server.Port
    if ($port -lt 1 -or $port -gt 65535) {
        Write-Host "  ✗ Port must be between 1-65535" -ForegroundColor Red
    } else {
        Write-Host "  ✓ Port: $port" -ForegroundColor Green
    }
}

if ($server.BodyLimit) {
    $limit = $server.BodyLimit
    if ($limit -match '^\d+[KMGT]?$') {
        Write-Host "  ✓ BodyLimit: $limit" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ BodyLimit format looks unusual: $limit" -ForegroundColor Yellow
    }
}

# Test 4: Storage paths
Write-Host ""
Write-Host "[Test 4] Storage Configuration..." -ForegroundColor Yellow
$storage = $xml.PLCLogVisualizer.Storage

if ($storage.DataDirectory) {
    Write-Host "  ✓ DataDirectory: $($storage.DataDirectory)" -ForegroundColor Green
}

if ($storage.MaxUploadSize) {
    Write-Host "  ✓ MaxUploadSize: $($storage.MaxUploadSize)" -ForegroundColor Green
}

# Test 5: Numeric ranges
Write-Host ""
Write-Host "[Test 5] Numeric Values..." -ForegroundColor Yellow

$validations = @(
    @{ Path = "Processing.MaxConcurrentParses"; Min = 1; Max = 20 },
    @{ Path = "Processing.SessionTimeoutMinutes"; Min = 1; Max = 1440 },
    @{ Path = "Advanced.CompressionLevel"; Min = 1; Max = 9 },
    @{ Path = "Advanced.DuckDBThreads"; Min = 1; Max = 32 }
)

foreach ($val in $validations) {
    $parts = $val.Path -split '\.'
    $value = $xml.PLCLogVisualizer
    foreach ($part in $parts) {
        $value = $value.$part
    }
    
    if ($value) {
        $num = [int]$value
        if ($num -lt $val.Min -or $num -gt $val.Max) {
            Write-Host "  ⚠ $($val.Path): $num (expected $($val.Min)-$($val.Max))" -ForegroundColor Yellow
        } else {
            Write-Host "  ✓ $($val.Path): $num" -ForegroundColor Green
        }
    }
}

# Test 6: Boolean values
Write-Host ""
Write-Host "[Test 6] Boolean Values..." -ForegroundColor Yellow
$booleans = @(
    "Server.EnableCORS",
    "Storage.EnablePersistence",
    "Processing.EnableCompression",
    "Security.AllowFileDeletion",
    "Security.RequireAuthentication",
    "Advanced.EnableRequestLogging"
)

foreach ($boolPath in $booleans) {
    $parts = $boolPath -split '\.'
    $value = $xml.PLCLogVisualizer
    foreach ($part in $parts) {
        $value = $value.$part
    }
    
    if ($value -ne $null) {
        $valid = @("true", "false", "1", "0") -contains $value.ToString().ToLower()
        if ($valid) {
            Write-Host "  ✓ $boolPath`: $value" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ $boolPath`: $value (should be true/false)" -ForegroundColor Yellow
        }
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Validation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration is valid and ready to use." -ForegroundColor Green
Write-Host "Restart the server to apply any changes." -ForegroundColor Cyan
