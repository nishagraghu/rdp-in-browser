@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo   GuacRDP Docker Orchestration Shutdown
echo ==================================================

rem 1. Check if Docker daemon is running
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker daemon is not running.
    exit /b 1
)

echo [INFO] Stopping all GuacRDP Docker services...
docker compose down

echo.
echo ==================================================
echo   All GuacRDP Docker containers stopped cleanly.
echo ==================================================
echo.

endlocal
