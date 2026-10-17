function Get-JarvisNode {
    $jarvisCandidates = @()
    if ($env:JARVIS_NODE) { $jarvisCandidates += $env:JARVIS_NODE }
    $jarvisCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if ($jarvisCommand) { $jarvisCandidates += $jarvisCommand.Source }
    if ($env:USERPROFILE) {
        $jarvisCandidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
    foreach ($jarvisCandidate in ($jarvisCandidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $jarvisCandidate -PathType Leaf)) { continue }
        try {
            & $jarvisCandidate -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 && typeof globalThis.WebSocket === 'function' ? 0 : 1)" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { return $jarvisCandidate }
        } catch { }
    }
    throw 'JARVIS requires Node.js 22 or newer with WebSocket support. Install a current Node.js LTS version, or set JARVIS_NODE to a compatible node.exe path, then start JARVIS again.'
}

function Get-JarvisPort {
    $jarvisPortValue = '8765'
    $jarvisPortFile = Join-Path $PSScriptRoot 'jarvis-port.txt'
    if (Test-Path -LiteralPath $jarvisPortFile) { $jarvisPortValue = (Get-Content -LiteralPath $jarvisPortFile -Raw).Trim() }
    if ($env:JARVIS_PORT) { $jarvisPortValue = $env:JARVIS_PORT }
    $jarvisPortNumber = 0
    if (-not [int]::TryParse($jarvisPortValue, [ref]$jarvisPortNumber) -or $jarvisPortNumber -lt 1024 -or $jarvisPortNumber -gt 65535) {
        throw 'JARVIS_PORT or jarvis-port.txt must contain a port number from 1024 to 65535.'
    }
    return $jarvisPortNumber
}
