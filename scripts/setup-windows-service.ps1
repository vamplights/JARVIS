param([Parameter(Mandatory=$true)][string]$NssmPath)
$ServiceName='JARVISLocal'
$ErrorActionPreference='Stop'
$jarvisRoot=Split-Path $PSScriptRoot -Parent
$jarvisAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $jarvisAdmin) { throw 'Run this one-time setup in PowerShell as Administrator.' }
$jarvisNssm=(Resolve-Path -LiteralPath $NssmPath).Path
if ([IO.Path]::GetFileName($jarvisNssm) -ne 'nssm.exe') { throw 'Supply the local nssm.exe downloaded from https://nssm.cc/download.' }
. (Join-Path $jarvisRoot 'Get-JarvisNode.ps1')
$jarvisNode=Get-JarvisNode
$jarvisPort=Get-JarvisPort
# Run under your Windows account so existing DPAPI authorization remains readable.
$jarvisIdentity=[Security.Principal.WindowsIdentity]::GetCurrent()
$jarvisCredential=Get-Credential -UserName $jarvisIdentity.Name -Message 'Windows account password for the local JARVIS service (not your PIN). Windows stores it in Service Control Manager.'
if (-not $jarvisCredential) { throw 'Service account credentials were not supplied.' }
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { throw 'JARVIS service already exists. Use Restart JARVIS or update its configuration explicitly.' }
# Stop only a verified JARVIS instance; preserve any unrelated process on the configured port.
$jarvisListeners=@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $jarvisPort -State Listen -ErrorAction SilentlyContinue)
if ($jarvisListeners.Count) {
 $env:JARVIS_PORT=[string]$jarvisPort
 $jarvisHealth=& $jarvisNode (Join-Path $jarvisRoot 'health-check.mjs') | ConvertFrom-Json
 if ($LASTEXITCODE -ne 0 -or $jarvisHealth.application -ne 'jarvis') { throw 'Port is not verified as JARVIS; no process stopped.' }
 foreach ($jarvisPid in ($jarvisListeners.OwningProcess | Select-Object -Unique)) {
  $jarvisProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$jarvisPid"
  if ($jarvisProcess.Name -ne 'node.exe' -or $jarvisProcess.CommandLine -notmatch 'server\.mjs') { throw 'Unexpected process; setup stopped.' }
  Stop-Process -Id $jarvisPid
 }
}
$jarvisWrapper=Join-Path $PSScriptRoot 'service-supervisor.ps1'
& $jarvisNssm install $ServiceName "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
if ($LASTEXITCODE -ne 0) { throw 'NSSM installation failed.' }
& $jarvisNssm set $ServiceName AppParameters "-NoProfile -ExecutionPolicy Bypass -File `"$jarvisWrapper`""
& $jarvisNssm set $ServiceName AppDirectory $jarvisRoot
& $jarvisNssm set $ServiceName AppEnvironmentExtra "JARVIS_PORT=$jarvisPort"
& $jarvisNssm set $ServiceName ObjectName $jarvisCredential.UserName $jarvisCredential.GetNetworkCredential().Password
if ($LASTEXITCODE -ne 0) { throw 'Windows service account configuration failed.' }
& $jarvisNssm set $ServiceName Start SERVICE_AUTO_START
& $jarvisNssm set $ServiceName AppExit Default Restart
& $jarvisNssm set $ServiceName AppRestartDelay 5000
& $jarvisNssm set $ServiceName AppStdout (Join-Path $jarvisRoot 'data\service.log')
& $jarvisNssm set $ServiceName AppStderr (Join-Path $jarvisRoot 'data\service-error.log')
# Allow this user to read/start/stop the service, so the familiar launchers keep working.
$jarvisSddl=(& sc.exe sdshow $ServiceName | Where-Object { $_ -match '^D:' }) -join ''
if (-not $jarvisSddl) { throw 'Could not read service permissions; inspect the service before starting.' }
$jarvisAce="(A;;LCRPWP;;;$($jarvisIdentity.User.Value))"
$jarvisNewSddl=if ($jarvisSddl.Contains('S:')) { $jarvisSddl.Replace('S:',($jarvisAce+'S:')) } else { $jarvisSddl+$jarvisAce }
& sc.exe sdset $ServiceName $jarvisNewSddl
if ($LASTEXITCODE -ne 0) { throw 'Could not grant local service control.' }
# Requested no-sleep configuration, for both plugged-in and battery operation.
powercfg.exe /change standby-timeout-ac 0
powercfg.exe /change standby-timeout-dc 0
powercfg.exe /change hibernate-timeout-ac 0
powercfg.exe /change hibernate-timeout-dc 0
$jarvisBoot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
@{service=$ServiceName;installedAt=[DateTime]::UtcNow.ToString('o');installedBoot=$jarvisBoot;rebootVerified=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $jarvisRoot 'data\service-install.json') -Encoding UTF8
Start-Service -Name $ServiceName
& (Join-Path $jarvisRoot 'Start JARVIS.ps1') -NoBrowser
Write-Host 'Service installed and started. After your next planned reboot, run scripts\verify-service.ps1 to confirm reboot survival.'
