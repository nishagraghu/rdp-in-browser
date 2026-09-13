#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🚀 GuacRDP Docker Orchestration Startup"
echo "=================================================="

# 1. Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker daemon is not running. Please start Docker / Docker Desktop and try again."
    exit 1
fi

# 2. Check container status
RUNNING_CONTAINERS=$(docker compose ps --services --filter "status=running" 2>/dev/null || true)

if [ -n "$RUNNING_CONTAINERS" ]; then
    echo "ℹ️ The following containers are already running:"
    echo "$RUNNING_CONTAINERS"
    echo ""
    echo "Re-checking status..."
else
    echo "📦 Containers are not currently running. Starting Docker Compose stack..."
    docker compose up -d --build
fi

echo ""
echo "=================================================="
echo "📊 Current Container Telemetry Status"
echo "=================================================="
docker compose ps

echo ""
echo "=================================================="
echo "🌐 Access Links & Services"
echo "=================================================="
echo "  • Frontend Portal:     http://localhost:5173"
echo "  • Backend API:         http://localhost:3001/health"
echo "  • Guacamole Engine:    localhost:4822"
echo "  • Ubuntu RDP Container: localhost:3389 (user: testuser, pass: testpass)"
echo "=================================================="
