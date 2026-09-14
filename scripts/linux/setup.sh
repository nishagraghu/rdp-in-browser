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

step "Building production Docker images (if needed)"
compose build

step "Starting application stack"
compose up -d --remove-orphans

if ! wait_for_healthy_services 180; then
  compose ps
  exit 1
fi

compose ps
show_application_info
success "Setup complete."
