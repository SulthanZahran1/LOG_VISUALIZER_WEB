# PLC Log Visualizer - Start Script
# Run this in PowerShell to build and start the application

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PLC Log Visualizer - Docker Startup  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Building containers..." -ForegroundColor Yellow
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Starting services..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start services!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Application is running!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:  http://localhost:8089" -ForegroundColor White
Write-Host ""
Write-Host "To stop: docker-compose down" -ForegroundColor Gray
Write-Host "To view logs: docker-compose logs -f" -ForegroundColor Gray
Write-Host ""

# Open browser
Start-Process "http://localhost:3000"
