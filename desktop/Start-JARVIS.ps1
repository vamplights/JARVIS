param([switch]$Check, [switch]$ImportData, [switch]$Detach, [switch]$Background)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'outputs\desktop-prototype\launch.log'
$lock = $null
$ownsLock = $false
try {
    if ($Detach) {
        $helperArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath), '-Background')
        $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        Start-Process -FilePath $windowsPowerShell -ArgumentList $helperArguments -WorkingDirectory $root -WindowStyle Hidden
        return
    }
    $lock = [System.Threading.Mutex]::new($false, 'Local\JARVIS.DesktopPrototype')
    try { $ownsLock = $lock.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsLock = $true }
    if (-not $ownsLock) { throw 'The JARVIS desktop prototype is already open.' }
    . (Join-Path $root 'scripts\Get-JarvisNode.ps1')
    $node = Get-JarvisNode
    $launchArguments = @((Join-Path $PSScriptRoot 'launch.mjs'))
    if ($Check) { $launchArguments += '--check' }
    if ($ImportData) { $launchArguments += '--import-data' }
    if ($Background) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
        $ErrorActionPreference = 'Continue'
        & $node @launchArguments *> $log
        $result = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($result -ne 0) { throw "JARVIS desktop prototype exited with code $result. See $log for details." }
    } else {
        & $node @launchArguments
        if ($LASTEXITCODE -ne 0) { throw "JARVIS desktop prototype exited with code $LASTEXITCODE." }
    }
} catch {
    if (-not ($Detach -or $Background)) { throw }
    $message = $_.Exception.Message
    if ($Background -and $ownsLock) {
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
            Add-Content -LiteralPath $log -Value $message
        } catch {
            $message += " The launcher also could not write to $log."
        }
    }
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($message, 'JARVIS Prototype')
    exit 1
} finally {
    if ($ownsLock) { $lock.ReleaseMutex() }
    if ($lock) { $lock.Dispose() }
}
