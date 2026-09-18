#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

echo "=================================================="
echo " rdp-in-browser — Production Setup (Linux)"
echo "=================================================="

step "Checking prerequisites"
check_docker
success "Docker and Docker Compose are available."

step "Preparing directories"
ensure_directories

step "Validating environment configuration"
ensure_env_file
validate_required_env

http_port="$(read_env_value HTTP_PORT || echo "80")"
check_port_available "${http_port}" || exit 1

step "Pulling Docker images (installs any that are not on this system)"
# Downloads guacd and any registry images (BACKEND_IMAGE / FRONTEND_IMAGE).
# Ignore failures for local-only tags so the next build step can create them.
compose pull --ignore-pull-failures || true

step "Building production Docker images (if needed)"
compose build

step "Starting application stack"
# --pull missing: if an image still is not local, pull it before starting
compose up -d --remove-orphans --pull missing

if ! wait_for_healthy_services 180; then
  compose ps
  exit 1
fi

compose ps
show_application_info
success "Setup complete."
