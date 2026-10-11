$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This ALTURA package requires Windows x64.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22+ x64, including npm, then reopen PowerShell.'
}
& node (Join-Path $PSScriptRoot 'scripts/teammate-local.mjs') setup
if ($LASTEXITCODE -ne 0) { throw 'ALTURA setup failed. Read the message above; existing local data was not reset.' }
