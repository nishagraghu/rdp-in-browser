#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

check_docker || exit 1

echo "=================================================="
echo " rdp-in-browser — Service Status"
echo "=================================================="

compose ps

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  show_application_info
fi
