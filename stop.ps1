# GuacRDP Docker Orchestration Shutdown Script for PowerShell

Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "🛑 GuacRDP Docker Orchestration Shutdown" -ForegroundColor Red
Write-Host "==================================================" -ForegroundColor Cipher

docker info >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Docker daemon is not running." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Stopping all GuacRDP Docker services..." -ForegroundColor Yellow
docker compose down

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "✅ All GuacRDP Docker containers stopped cleanly." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cipher
