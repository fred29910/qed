#!/bin/bash
# Build all platforms in sequence.
# Use for CI; for local dev, prefer the per-platform script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/build-mac.sh
bash scripts/build-windows.sh
bash scripts/build-linux.sh

echo "==> All platforms built."
