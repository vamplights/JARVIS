param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Get-JarvisNode.ps1')
$jarvisNode = Get-JarvisNode
& $jarvisNode (Join-Path $PSScriptRoot 'scripts\init-settings.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Initial settings setup failed.' }
$jarvisPort = Get-JarvisPort
$env:JARVIS_PORT = [string]$jarvisPort
$jarvisUrl = "http://127.0.0.1:$jarvisPort"
$jarvisData = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force -Path $jarvisData | Out-Null
$jarvisHealth = Join-Path $PSScriptRoot 'health-check.mjs'
function Test-JarvisReady {
    try {
        $jarvisHealthOutput = & $jarvisNode $jarvisHealth 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        $jarvisResponse = $jarvisHealthOutput | ConvertFrom-Json
        return $jarvisResponse.application -eq 'jarvis'
    } catch { return $false }
}
$jarvisService=Get-Service -Name 'JARVISLocal' -ErrorAction SilentlyContinue
if ($jarvisService) {
    if ($jarvisService.Status -ne 'Running') { Start-Service -Name 'JARVISLocal' }
    $jarvisServiceDeadline=(Get-Date).AddSeconds(20)
    while (-not (Test-JarvisReady) -and (Get-Date) -lt $jarvisServiceDeadline) { Start-Sleep -Milliseconds 500 }
}
if (-not (Test-JarvisReady)) {
    if ($jarvisService) { throw 'The JARVIS service has not passed its health check yet. See data\service-error.log.' }
    $jarvisStarted = Start-Process -FilePath $jarvisNode -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $jarvisData 'server.log') -RedirectStandardError (Join-Path $jarvisData 'server-error.log') -PassThru
    $jarvisDeadline = (Get-Date).AddSeconds(20)
    $jarvisReady = $false
    do {
        if ($jarvisStarted.HasExited) { break }
        if (Test-JarvisReady) { $jarvisReady = $true; break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $jarvisDeadline)
    if (-not $jarvisReady) {
        $jarvisDetails = Get-Content -LiteralPath (Join-Path $jarvisData 'server-error.log') -Tail 12 -ErrorAction SilentlyContinue
        throw "JARVIS did not start. Check data\server-error.log in the project folder.`n$($jarvisDetails -join [Environment]::NewLine)"
    }
}
Write-Host "JARVIS is running at $jarvisUrl"
if (-not $NoBrowser) { Start-Process $jarvisUrl }
