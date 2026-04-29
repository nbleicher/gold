#Requires -Version 5.0
<#
  Build portable Gold Label Bridge for Windows x64.
  Run from repo root: powershell -ExecutionPolicy Bypass -File packaging/label-bridge-win/scripts/build-release.ps1
#>
$ErrorActionPreference = 'Stop'

if (-not [System.Environment]::Is64BitOperatingSystem) {
  Write-Error 'This release targets 64-bit Windows only.'
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PkgRoot = Resolve-Path (Join-Path $ScriptDir '..')
$RepoRoot = Resolve-Path (Join-Path $PkgRoot '..\..')

$NodeVersion = (Get-Content (Join-Path $PkgRoot '.node-version') -Raw).Trim()
if (-not $NodeVersion) { Write-Error '.node-version is empty' }

$running = (node -p "process.version.slice(1)" 2>$null)
if (-not $running) { Write-Error 'Node.js is not on PATH. Install Node and retry.' }
$wantMajor = ($NodeVersion -split '\.')[0]
$runMajor = ($running -split '\.')[0]
if ($runMajor -ne $wantMajor) {
  Write-Warning "Active Node major v$runMajor differs from .node-version major v$wantMajor. Native modules may not load. Install Node $NodeVersion and retry."
}

Write-Host ">> npm ci in $PkgRoot"
Push-Location $PkgRoot
try {
  npm ci
} finally {
  Pop-Location
}

$DistRoot = Join-Path $PkgRoot 'dist'
$DistDir = Join-Path $DistRoot 'GoldLabelBridge'
$OutputDir = Join-Path $PkgRoot 'output'

if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host '>> Copy label-server.js'
Copy-Item (Join-Path $RepoRoot 'label-server.js') (Join-Path $DistDir 'label-server.js') -Force

Write-Host '>> Copy node_modules'
$null = robocopy (Join-Path $PkgRoot 'node_modules') (Join-Path $DistDir 'node_modules') /E /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules failed with exit $LASTEXITCODE" }

Write-Host ">> Download Node v$NodeVersion win-x64 zip"
$zipName = "node-v$NodeVersion-win-x64.zip"
$zipUrl = "https://nodejs.org/dist/v$NodeVersion/$zipName"
$zipPath = Join-Path $env:TEMP "gold-label-node-$NodeVersion.zip"
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

$expandRoot = Join-Path $env:TEMP "gold-label-node-expand-$NodeVersion"
if (Test-Path $expandRoot) { Remove-Item $expandRoot -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $expandRoot -Force

$inner = Get-ChildItem $expandRoot -Directory | Select-Object -First 1
if (-not $inner) { throw 'Unexpected Node zip layout (no inner directory)' }

Write-Host '>> Copy node.exe'
Copy-Item (Join-Path $inner.FullName 'node.exe') (Join-Path $DistDir 'node.exe') -Force

$bat = @"
@echo off
cd /d "%~dp0"
"%~dp0node.exe" "%~dp0label-server.js"
if errorlevel 1 pause
"@
Set-Content -Path (Join-Path $DistDir 'Start Gold Label Bridge.bat') -Value $bat -Encoding ASCII

Copy-Item (Join-Path $PkgRoot 'assets\README-USER.txt') (Join-Path $DistDir 'README-USER.txt') -Force

$zipOut = Join-Path $OutputDir 'GoldLabelBridge-win-x64.zip'
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
Write-Host ">> Zip -> $zipOut"
Compress-Archive -LiteralPath $DistDir -DestinationPath $zipOut -Force

Write-Host ''
Write-Host 'Done.'
Write-Host "  Staging: $DistDir"
Write-Host "  Zip:     $zipOut"
Write-Host '  Next: compile installer\GoldLabelBridge.iss with Inno Setup 6 (ISCC.exe) if you need Setup.exe.'
Write-Host ''
