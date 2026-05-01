$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
$LogFile = Join-Path $LogDir "bot-web.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Set-Location $RepoRoot
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Encoding utf8 -Value "[$timestamp] Starting Gaban web app"

$env:NO_COLOR = "1"
$env:FORCE_COLOR = "0"
$env:NEXT_TELEMETRY_DISABLED = "1"

Write-Host "=== Gaban Bot Web ===" -ForegroundColor Cyan
Write-Host "Repo:  $RepoRoot"
Write-Host "Log:   $LogFile"
Write-Host "Port:  http://localhost:3010"
Write-Host "Press Ctrl+C to stop. Window stays open on exit so you can read errors."
Write-Host ""

# Stream npm output to BOTH the console and the log file.
# 2>&1 merges stderr into the pipeline so errors show up too.
& cmd /d /s /c "npm run start:web 2>&1" | Tee-Object -FilePath $LogFile -Append

$exit = $LASTEXITCODE
Write-Host ""
Write-Host "=== Process exited with code $exit ===" -ForegroundColor Yellow
Write-Host "Press Enter to close this window..."
Read-Host | Out-Null
