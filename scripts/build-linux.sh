#!/bin/bash
# Linux build
# Produces bin/qed. The .AppImage and .deb are produced by the
# package-linux.sh step (separated so CI can opt in or out).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Compiling qed for Linux"
mkdir -p bin
perry compile src/main.ts -o bin/qed --target linux --march x86-64-v2

echo "==> Done. Artifact:"
ls -l bin/qed
