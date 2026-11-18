param([switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$prototype = Join-Path $root 'outputs\desktop-prototype'
$buildTools = Join-Path $prototype 'build-tools'
$artifacts = Join-Path $prototype 'dist'
$savedEnvironment = @{}
foreach ($name in @('PATH', 'RUSTUP_HOME', 'CARGO_HOME', 'npm_config_cache')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
Push-Location -LiteralPath $artifacts
try {
    $localCargo = Join-Path $buildTools 'cargo\bin\cargo.exe'
    if (Test-Path -LiteralPath $localCargo -PathType Leaf) {
        $env:RUSTUP_HOME = Join-Path $buildTools 'rustup'
        $env:CARGO_HOME = Join-Path $buildTools 'cargo'
        $env:PATH = (Split-Path -Parent $localCargo) + ';' + $env:PATH
    }
    $env:npm_config_cache = Join-Path $buildTools 'npm-cache'
    $buildOptions = @(
        '--config', (Join-Path $PSScriptRoot 'pake.json'),
        '--icon', (Join-Path $root 'jarvis-logo.svg'),
        '--keep-binary', '--no-restore-last-url', '--json'
    )
    if ($DebugBuild) { $buildOptions += '--debug' }
    & npx.cmd --yes pake-cli@3.18.0 @buildOptions
    if ($LASTEXITCODE -ne 0) { throw "Pake exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
}
