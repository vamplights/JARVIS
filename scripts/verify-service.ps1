$ErrorActionPreference='Stop'
$jarvisRoot=Split-Path $PSScriptRoot -Parent
$jarvisFile=Join-Path $jarvisRoot 'data\service-install.json'
$jarvisInstall=Get-Content -Raw -LiteralPath $jarvisFile | ConvertFrom-Json
$jarvisService=Get-CimInstance Win32_Service -Filter "Name='$($jarvisInstall.service)'"
if ($jarvisService.StartMode -ne 'Auto' -or $jarvisService.State -ne 'Running') { throw 'Service is not automatically running.' }
$jarvisBoot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
if ($jarvisBoot -le [DateTime]::Parse($jarvisInstall.installedBoot)) { throw 'No reboot since setup. Verification remains pending; run this after a planned reboot.' }
. (Join-Path $jarvisRoot 'Get-JarvisNode.ps1')
$env:JARVIS_PORT=[string](Get-JarvisPort)
& (Get-JarvisNode) (Join-Path $jarvisRoot 'health-check.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Local health check failed after reboot.' }
$jarvisInstall.rebootVerified=$true
$jarvisInstall | Add-Member -NotePropertyName verifiedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$jarvisInstall | ConvertTo-Json | Set-Content -LiteralPath $jarvisFile -Encoding UTF8
Write-Host 'Verified: JARVIS started automatically after this reboot and its local health check passes.'
