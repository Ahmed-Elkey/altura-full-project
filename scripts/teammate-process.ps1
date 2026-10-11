param(
  [Parameter(Mandatory=$true)][ValidateSet('Inspect','Stop')][string]$Action,
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$ExpectedExecutable,
  [Parameter(Mandatory=$true)][string]$ExpectedArgument,
  [string]$ExpectedCreated
)
$ErrorActionPreference='Stop'
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
if (!$p) { if ($Action -eq 'Stop') { exit 0 }; throw 'Owned process is not running.' }
$created=$p.CreationDate.ToUniversalTime().ToString('o')
$commandPath=if ($p.CommandLine) { $p.CommandLine.Replace('/','\') } else { '' }
$argumentPath=$ExpectedArgument.Replace('/','\')
if (![string]::Equals($p.ExecutablePath,$ExpectedExecutable,[StringComparison]::OrdinalIgnoreCase) -or !$commandPath -or $commandPath.IndexOf($argumentPath,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'Process identity does not match this demo. Refusing to touch it.'
}
if ($ExpectedCreated -and $created -ne $ExpectedCreated) { throw 'PID has been reused. Refusing to touch it.' }
if ($Action -eq 'Stop') { Stop-Process -Id $ProcessId -ErrorAction Stop }
else { @{pid=$ProcessId;created=$created;executable=$p.ExecutablePath;argument=$ExpectedArgument} | ConvertTo-Json -Compress }
