#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

follow=false
service=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--follow)
      follow=true
      shift
      ;;
    *)
      service="$1"
      shift
      ;;
  esac
done

if [[ "${follow}" == "true" ]]; then
  if [[ -n "${service}" ]]; then
    compose logs -f "${service}"
  else
    compose logs -f
  fi
else
  if [[ -n "${service}" ]]; then
    compose logs "${service}"
  else
    compose logs
  fi
fi
