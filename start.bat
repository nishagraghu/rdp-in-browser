@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo   GuacRDP Docker Orchestration Startup
echo ==================================================

rem 1. Check if Docker daemon is running
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker daemon is not running. Please start Docker Desktop and try again.
    exit /b 1
)

rem 2. Check container status and start stack
echo [INFO] Starting Docker Compose stack...
docker compose up -d --build

echo.
echo ==================================================
echo   Current Container Telemetry Status
echo ==================================================
docker compose ps

echo.
echo ==================================================
echo   Access Links ^& Services
echo   * Frontend Portal:     http://localhost:5173
echo   * Backend API:         http://localhost:3001/health
echo   * Guacamole Engine:    localhost:4822
echo   * Ubuntu RDP Container: localhost:3389 (user: testuser, pass: testpass)
echo ==================================================
echo.

endlocal
