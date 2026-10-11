$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This ALTURA package requires Windows x64.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ x64, then run SETUP_ALTURA.ps1.' }
& node (Join-Path $PSScriptRoot 'scripts/teammate-local.mjs') start
if ($LASTEXITCODE -ne 0) { throw 'ALTURA startup failed. Read the message above.' }
