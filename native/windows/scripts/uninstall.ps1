#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$InstallDirectory = "$env:ProgramFiles\StopScrolling"
)

$ErrorActionPreference = 'Stop'
$serviceBinary = Join-Path $InstallDirectory 'StopScrollingService.exe'

foreach ($name in @('StopScrollingStrictWatchdog', 'StopScrollingService')) {
  & sc.exe stop $name 2>$null
}

$deadline = (Get-Date).AddSeconds(20)
do {
  $running = Get-Service StopScrollingService, StopScrollingStrictWatchdog -ErrorAction SilentlyContinue |
    Where-Object Status -ne 'Stopped'
  if (-not $running) { break }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if (Test-Path -LiteralPath $serviceBinary) {
  & $serviceBinary --cleanup
  if ($LASTEXITCODE -ne 0) { throw 'Native WFP/state cleanup failed; binaries were retained.' }
}

foreach ($name in @('StopScrollingStrictWatchdog', 'StopScrollingService')) {
  & sc.exe delete $name 2>$null
}
Remove-Item -LiteralPath $InstallDirectory -Recurse -Force -ErrorAction SilentlyContinue
