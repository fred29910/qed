#!/bin/bash
# macOS packaging — produce a .dmg for distribution.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d bin/qed.app ]; then
    echo "==> bin/qed.app missing; running build first"
    bash scripts/build-mac.sh
fi

echo "==> Producing .dmg"
perry publish macos --format dmg --out bin/qed.dmg

echo "==> Done. Artifact:"
ls -l bin/qed.dmg
