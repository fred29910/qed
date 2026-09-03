#!/bin/bash
# macOS build
# Produces bin/qed (the raw binary) and bin/qed.app (the bundle).
#
# The .app bundle is what users actually run; the raw binary is
# produced first because `perry publish macos` wraps it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Compiling qed for macOS"
mkdir -p bin
perry compile src/main.ts -o bin/qed --march x86-64-v2

echo "==> Producing .app bundle"
perry publish macos --out bin/qed.app

echo "==> Done. Artifacts:"
ls -l bin/qed bin/qed.app
