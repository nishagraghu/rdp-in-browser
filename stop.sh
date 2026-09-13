#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🛑 GuacRDP Docker Orchestration Shutdown"
echo "=================================================="

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker daemon is not running."
    exit 1
fi

echo "📦 Stopping all GuacRDP Docker services..."
docker compose down

echo ""
echo "=================================================="
echo "✅ All GuacRDP Docker containers stopped cleanly."
echo "=================================================="
