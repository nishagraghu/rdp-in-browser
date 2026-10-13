#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"

fail() { echo "[ERROR] $1" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is not installed. See README.md for install links."
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker and retry."
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is required (docker compose)."
fi

if [[ ! -f .env ]]; then
  if [[ ! -f .env.example ]]; then
    fail ".env.example is missing."
  fi
  cp .env.example .env
  fail "Created .env from .env.example. Edit .env, set the three secrets, then run this script again."
fi

required=(JWT_ACCESS_SECRET JWT_REFRESH_SECRET VM_ENCRYPTION_KEY)
for name in "${required[@]}"; do
  value="$(grep -E "^${name}=" .env | tail -n 1 | cut -d'=' -f2- | tr -d '\r' || true)"
  if [[ -z "${value}" || ${#value} -lt 32 ]]; then
    fail "${name} must be set in .env (minimum 32 characters). See README.md."
  fi
done

echo "==> Pulling latest images..."
docker compose pull

echo "==> Starting rdp-in-browser..."
docker compose up -d --remove-orphans

http_port="$(grep -E '^HTTP_PORT=' .env | tail -n 1 | cut -d'=' -f2- | tr -d '\r' || true)"
http_port="${http_port:-80}"

echo ""
echo "=================================================="
echo " rdp-in-browser is starting"
echo "=================================================="
echo " Application : http://localhost:${http_port}"
echo " Setup       : http://localhost:${http_port}/setup"
echo " Health      : http://localhost:${http_port}/health"
echo "=================================================="
