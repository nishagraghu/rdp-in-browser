#!/usr/bin/env bash
# Shared helpers for Linux deployment scripts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"

step() {
  echo ""
  echo "==> $1"
}

success() {
  echo "[OK] $1"
}

warn() {
  echo "[WARN] $1"
}

fail() {
  echo "[ERROR] $1" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$1 is not installed or not in PATH."
    return 1
  fi
}

check_docker() {
  require_command docker || return 1

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but the daemon is not running."
    echo "Start Docker with: sudo systemctl start docker"
    return 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 is not available."
    echo "Install Docker Compose plugin: https://docs.docker.com/compose/install/linux/"
    return 1
  fi
}

ensure_directories() {
  mkdir -p "${PROJECT_ROOT}/server/data"
}

read_env_value() {
  local key="$1"
  local env_file="${PROJECT_ROOT}/.env"

  if [[ ! -f "${env_file}" ]]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" "${env_file}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi

  echo "${line#*=}" | tr -d '\r'
}

ensure_env_file() {
  local env_file="${PROJECT_ROOT}/.env"
  local example_file="${PROJECT_ROOT}/.env.example"

  if [[ ! -f "${example_file}" ]]; then
    fail ".env.example is missing from the project root."
    exit 1
  fi

  if [[ ! -f "${env_file}" ]]; then
    cp "${example_file}" "${env_file}"
    warn "Created .env from .env.example."
    echo "Edit .env and set all required secrets before continuing."
    exit 1
  fi
}

validate_required_env() {
  local env_file="${PROJECT_ROOT}/.env"
  local required=(JWT_ACCESS_SECRET JWT_REFRESH_SECRET VM_ENCRYPTION_KEY)
  local missing=()

  for name in "${required[@]}"; do
    local value
    value="$(grep -E "^${name}=" "${env_file}" | tail -n 1 | cut -d'=' -f2- || true)"
    value="${value// /}"
    value="${value//$'\r'/}"

    if [[ -z "${value}" ]]; then
      missing+=("${name}")
      continue
    fi

    if [[ ${#value} -lt 32 ]]; then
      fail "${name} must be at least 32 characters."
      exit 1
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required values in .env: ${missing[*]}"
    echo "Generate secure values with: openssl rand -base64 48"
    exit 1
  fi

  if grep -Eq '^AUTO_SEED=true' "${env_file}"; then
    warn "AUTO_SEED=true will create demo accounts on first startup. Not recommended for production."
  fi
}

compose() {
  (
    cd "${PROJECT_ROOT}"
    docker compose -f "${COMPOSE_FILE}" "$@"
  )
}

wait_for_healthy_services() {
  local timeout="${1:-180}"
  local deadline=$((SECONDS + timeout))
  local services=(guacd server frontend)
  local require_healthy=(0 1 1)

  step "Waiting for services to become healthy (timeout: ${timeout}s)..."

  while (( SECONDS < deadline )); do
    local all_healthy=true

    for i in "${!services[@]}"; do
      local service="${services[$i]}"
      local must_be_healthy="${require_healthy[$i]}"
      local container_id
      container_id="$(compose ps -q "${service}" 2>/dev/null || true)"
      if [[ -z "${container_id}" ]]; then
        all_healthy=false
        break
      fi

      if [[ "${must_be_healthy}" == "1" ]]; then
        local health
        health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || echo "unknown")"
        if [[ "${health}" != "healthy" ]]; then
          all_healthy=false
          break
        fi
      else
        local state
        state="$(docker inspect --format='{{.State.Status}}' "${container_id}" 2>/dev/null || echo "unknown")"
        if [[ "${state}" != "running" ]]; then
          all_healthy=false
          break
        fi
      fi
    done

    if [[ "${all_healthy}" == "true" ]]; then
      success "All services are healthy."
      return 0
    fi

    sleep 5
  done

  fail "Timed out waiting for services to become healthy."
  echo "Check logs with: scripts/linux/logs.sh"
  return 1
}

show_application_info() {
  local http_port
  http_port="$(read_env_value HTTP_PORT || echo "80")"
  local cors_origin
  cors_origin="$(read_env_value CORS_ORIGIN || echo "http://localhost")"

  echo ""
  echo "=================================================="
  echo " rdp-in-browser is running"
  echo "=================================================="
  echo " Application URL : http://localhost:${http_port}"
  echo " Health check    : http://localhost:${http_port}/health"
  echo " First-time setup: http://localhost:${http_port}/setup"
  echo " Public URL hint : ${cors_origin}"
  echo ""
  echo " Persistent data : Docker volume 'rdp-server-data'"
  echo " Shared drives   : Docker volume 'rdp-shared-drives'"
  echo "=================================================="
}

check_port_available() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :${port} )" | grep -q ":${port}"; then
      fail "Port ${port} is already in use on this host."
      echo "Change HTTP_PORT in .env or stop the process using that port."
      return 1
    fi
  fi
}
