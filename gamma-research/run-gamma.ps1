# Jarvis Gamma Research Runner
$ErrorActionPreference = "Stop"

$Jarvis = Split-Path -Parent $PSScriptRoot
$Root = $PSScriptRoot

$Reports = Join-Path $Root "reports"
$Logs = Join-Path $Root "logs"
$PromptFile = Join-Path $Root "prompt.md"

New-Item -ItemType Directory -Force -Path $Reports, $Logs | Out-Null

if (-not (Test-Path $PromptFile)) {
    throw "Missing prompt file: $PromptFile"
}

$Codex = (Get-Command codex.cmd -ErrorAction Stop).Source

$Stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$Report = Join-Path $Reports "gamma_$Stamp.md"
$Log = Join-Path $Logs "gamma_$Stamp.log"

Write-Host "Starting Jarvis Gamma Research..."

# Feed the complete prompt through standard input.
# Codex reads '-' as the entire prompt.
$ErrorActionPreference = "Continue"

Get-Content -LiteralPath $PromptFile -Raw |
    & $Codex exec `
        --cd $Jarvis `
        --sandbox read-only `
        --output-last-message $Report `
        - 2> $Log

$ExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($ExitCode -ne 0) {
    Write-Host "Codex failed. Log: $Log"
    exit $ExitCode
}

if (-not (Test-Path $Report)) {
    throw "Codex finished but no report was created."
}

Write-Host "Report saved: $Report"