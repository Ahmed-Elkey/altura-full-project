$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This ALTURA package requires Windows x64.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required to stop this ALTURA copy safely.' }
& node (Join-Path $PSScriptRoot 'scripts/teammate-local.mjs') stop
if ($LASTEXITCODE -ne 0) { throw 'ALTURA stop refused an unsafe or unrecognized process. No unknown process was killed.' }
