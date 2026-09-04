#!/bin/bash
# Linux packaging — produce AppImage and .deb.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f bin/qed ]; then
    echo "==> bin/qed missing; running build first"
    bash scripts/build-linux.sh
fi

echo "==> Producing AppImage"
perry publish linux --format appimage --out bin/qed.AppImage

echo "==> Producing .deb"
perry publish linux --format deb --out bin/qed.deb

echo "==> Done. Artifacts:"
ls -l bin/qed.AppImage bin/qed.deb
