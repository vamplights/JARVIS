$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Get-JarvisNode.ps1')
$jarvisNode = Get-JarvisNode
$jarvisPort = Get-JarvisPort
$env:JARVIS_PORT = [string]$jarvisPort
if (Get-Service -Name 'JARVISLocal' -ErrorAction SilentlyContinue) { Restart-Service -Name 'JARVISLocal'; Start-Sleep -Seconds 3; & (Join-Path $PSScriptRoot 'Start JARVIS.ps1') -NoBrowser; exit }
$jarvisListeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $jarvisPort -State Listen -ErrorAction SilentlyContinue)
if ($jarvisListeners.Count -gt 0) {
    $jarvisHealthOutput = & $jarvisNode (Join-Path $PSScriptRoot 'health-check.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Port $jarvisPort could not be verified as JARVIS. Nothing was stopped." }
    $jarvisState = $jarvisHealthOutput | ConvertFrom-Json
    if ($jarvisState.application -ne 'jarvis') { throw "Port $jarvisPort is not the expected JARVIS service. Nothing was stopped." }
    foreach ($jarvisProcessId in ($jarvisListeners.OwningProcess | Select-Object -Unique)) {
        $jarvisProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $jarvisProcessId"
        if ($jarvisProcess.Name -ne 'node.exe' -or $jarvisProcess.CommandLine -notmatch '(?:^|[\s"/\\])server\.mjs(?:[\s"]|$)') {
            throw 'The listening process could not be verified as JARVIS. Nothing was stopped.'
        }
        Stop-Process -Id $jarvisProcessId
        Wait-Process -Id $jarvisProcessId -Timeout 10 -ErrorAction SilentlyContinue
    }
}
& (Join-Path $PSScriptRoot 'Start JARVIS.ps1') -NoBrowser
