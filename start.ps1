# GuacRDP Docker Orchestration Startup Script for PowerShell

Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "🚀 GuacRDP Docker Orchestration Startup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cipher

# 1. Check if Docker daemon is running
docker info >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Docker daemon is not running. Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

# 2. Check container status
$running = docker compose ps --services --filter "status=running" 2>$null

if ($running) {
    Write-Host "ℹ️ The following containers are already running:" -ForegroundColor Yellow
    Write-Host $running -ForegroundColor Yellow
} else {
    Write-Host "📦 Containers are not currently running. Starting Docker Compose stack..." -ForegroundColor Green
    docker compose up -d --build
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "📊 Current Container Telemetry Status" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cipher
docker compose ps

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "🌐 Access Links & Services" -ForegroundColor Green
Write-Host "  • Frontend Portal:     http://localhost:5173"
Write-Host "  • Backend API:         http://localhost:3001/health"
Write-Host "  • Guacamole Engine:    localhost:4822"
Write-Host "  • Ubuntu RDP Container: localhost:3389 (user: testuser, pass: testpass)"
Write-Host "==================================================" -ForegroundColor Cipher
