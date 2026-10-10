#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

check_docker

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  fail ".env not found. Run scripts/linux/setup.sh first."
  exit 1
fi

validate_required_env

step "Starting rdp-in-browser"
compose up -d --remove-orphans

if ! wait_for_healthy_services 180; then
  exit 1
fi

show_application_info
