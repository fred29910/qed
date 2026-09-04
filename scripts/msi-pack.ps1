# Windows MSI packaging
#
# Wraps the standalone `bin/qed.exe` produced by `perry compile` in a
# WiX 3.x .msi installer. Run via `bash scripts/package-windows.sh`.
#
# This script is intentionally simple: it looks for `candle.exe` and
# `light.exe` (the WiX toolset) on PATH. If they aren't there, it
# falls back to leaving the user with the standalone .exe, which is
# fully self-contained.
#
# To install WiX: https://wixtoolset.org/releases/

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSCommandPath
Set-Location $root

if (-not (Test-Path "bin/qed.exe")) {
    Write-Host "==> bin/qed.exe missing; running build first"
    bash scripts/build-windows.sh
}

$wix = Get-Command candle.exe -ErrorAction SilentlyContinue
if (-not $wix) {
    Write-Host "==> WiX (candle.exe) not found on PATH. Skipping .msi step."
    Write-Host "    The standalone bin/qed.exe is fully self-contained."
    exit 0
}

Write-Host "==> Building .msi from bin/qed.exe"
# The WiX source lives in scripts/qed.wxs and is generated on demand
# if missing.
$wxs = "scripts/qed.wxs"
if (-not (Test-Path $wxs)) {
    @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="qed" Version="0.1.0" Manufacturer="qed" Language="1033">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade DowngradeErrorMessage="A newer version is installed." />
    <MediaTemplate EmbedCab="yes" />
    <Feature Id="ProductFeature" Title="qed" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Product>
  <Fragment>
    <Directory Id="INSTALLFOLDER" Name="qed" />
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
      <Component>
        <File Source="bin/qed.exe" KeyPath="yes" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
"@ | Out-File -Encoding utf8 $wxs
}

& candle.exe -out "bin/qed.wixobj" $wxs
& light.exe -ext WixUIExtension -out "bin/qed.msi" "bin/qed.wixobj"

Write-Host "==> Done. Artifact:"
Get-Item bin/qed.msi | Format-List
