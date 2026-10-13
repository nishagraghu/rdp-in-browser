#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

step "Restarting rdp-in-browser"
compose restart

if ! wait_for_healthy_services 180; then
  exit 1
fi

show_application_info
