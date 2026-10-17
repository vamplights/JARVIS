$ErrorActionPreference='Stop'
$jarvisRoot=Split-Path $PSScriptRoot -Parent
. (Join-Path $jarvisRoot 'Get-JarvisNode.ps1')
$jarvisNode=Get-JarvisNode
$env:JARVIS_PORT=[string](Get-JarvisPort)
$jarvisProcess=$null
try {
 while ($true) {
  $jarvisProcess=Start-Process -FilePath $jarvisNode -ArgumentList @('server.mjs') -WorkingDirectory $jarvisRoot -WindowStyle Hidden -PassThru
  $jarvisStarted=Get-Date
  while (-not $jarvisProcess.HasExited) {
   Start-Sleep -Seconds 30
   $jarvisHealthy=$false
   try { $jarvisHealth=Get-Content -Raw -LiteralPath (Join-Path $jarvisRoot 'data\local-health.json') | ConvertFrom-Json; $jarvisHealthy=$jarvisHealth.pid -eq $jarvisProcess.Id -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$jarvisHealth.heartbeatAt) -lt 180000 } catch {}
   if (-not $jarvisHealthy -and ((Get-Date)-$jarvisStarted).TotalSeconds -gt 180) { Stop-Process -Id $jarvisProcess.Id -ErrorAction SilentlyContinue; break }
  }
  Start-Sleep -Seconds 5
 }
} finally { if ($jarvisProcess -and -not $jarvisProcess.HasExited) { Stop-Process -Id $jarvisProcess.Id -ErrorAction SilentlyContinue } }
