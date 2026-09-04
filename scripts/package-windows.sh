#!/bin/bash
# Windows packaging — wrap bin/qed.exe in a .msi via WiX.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f bin/qed.exe ]; then
    echo "==> bin/qed.exe missing; running build first"
    bash scripts/build-windows.sh
fi

if command -v pwsh >/dev/null 2>&1; then
    pwsh -File scripts/msi-pack.ps1
elif command -v powershell >/dev/null 2>&1; then
    powershell -File scripts/msi-pack.ps1
else
    echo "==> No PowerShell found; skipping .msi step. Use the .exe directly."
    exit 0
fi
