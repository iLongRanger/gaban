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

cmd /d /s /c "npm run start:web >> `"$LogFile`" 2>&1"
