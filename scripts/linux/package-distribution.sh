#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/distribution"
OUTPUT="${PROJECT_ROOT}/rdp-in-browser-distribution.zip"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "[ERROR] distribution/ folder not found." >&2
  exit 1
fi

required=(
  "${DIST_DIR}/docker-compose.yml"
  "${DIST_DIR}/.env.example"
  "${DIST_DIR}/README.md"
  "${DIST_DIR}/start.sh"
  "${DIST_DIR}/start.ps1"
)

for file in "${required[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "[ERROR] Missing required file: ${file}" >&2
    exit 1
  fi
done

rm -f "${OUTPUT}"

(
  cd "${DIST_DIR}"
  zip -r "${OUTPUT}" \
    docker-compose.yml \
    .env.example \
    README.md \
    start.sh \
    start.ps1
)

echo "[OK] Created ${OUTPUT}"
echo "Send this ZIP to your customer. It contains no source code."
