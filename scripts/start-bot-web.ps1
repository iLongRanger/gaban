$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Set-Location $RepoRoot
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path (Join-Path $LogDir "bot-web.log") -Value "[$timestamp] Starting Gaban web app"

cmd /c npm run start:web 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "bot-web.log") -Append
