#!/bin/bash
# Windows build
# Produces bin/qed.exe. The .msi step is in package-windows.sh
# (separated so CI can opt in or out).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Compiling qed for Windows"
mkdir -p bin
perry compile src/main.ts -o bin/qed.exe --target windows --march x86-64-v2

echo "==> Done. Artifact:"
ls -l bin/qed.exe
