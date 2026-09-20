#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$BinarySource,
  [string]$InstallDirectory = "$env:ProgramFiles\StopScrolling"
)

$ErrorActionPreference = 'Stop'
$serviceBinary = Join-Path $BinarySource 'StopScrollingService.exe'
$watchdogBinary = Join-Path $BinarySource 'StopScrollingStrictWatchdog.exe'

foreach ($binary in @($serviceBinary, $watchdogBinary)) {
  if (-not (Test-Path -LiteralPath $binary)) { throw "Missing signed binary: $binary" }
  $signature = Get-AuthenticodeSignature -FilePath $binary
  if ($signature.Status -ne 'Valid') { throw "Authenticode validation failed for $binary: $($signature.Status)" }
}

New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
Copy-Item -LiteralPath $serviceBinary -Destination $InstallDirectory -Force
Copy-Item -LiteralPath $watchdogBinary -Destination $InstallDirectory -Force

$installedService = Join-Path $InstallDirectory 'StopScrollingService.exe'
$installedWatchdog = Join-Path $InstallDirectory 'StopScrollingStrictWatchdog.exe'

& sc.exe create StopScrollingService binPath= "`"$installedService`"" start= auto obj= LocalSystem DisplayName= "Stop Scrolling Blocking Service"
if ($LASTEXITCODE -notin @(0, 1073)) { throw "Could not create blocking service ($LASTEXITCODE)" }
& sc.exe create StopScrollingStrictWatchdog binPath= "`"$installedWatchdog`"" start= auto obj= LocalSystem DisplayName= "Stop Scrolling Strict Watchdog"
if ($LASTEXITCODE -notin @(0, 1073)) { throw "Could not create watchdog service ($LASTEXITCODE)" }

# The blocker itself has no unconditional SCM restart policy. Only the watchdog
# may start it, and only while the protected monotonic strict marker is live.
& sc.exe failure StopScrollingService reset= 0 actions= ""
& sc.exe failure StopScrollingStrictWatchdog reset= 86400 actions= restart/1000/restart/5000
& sc.exe sdset StopScrollingService 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;AU)'
& sc.exe sdset StopScrollingStrictWatchdog 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;AU)'

& sc.exe start StopScrollingStrictWatchdog
& sc.exe start StopScrollingService
