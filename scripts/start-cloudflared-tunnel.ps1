$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path (Join-Path $LogDir "cloudflared.log") -Value "[$timestamp] Starting Cloudflare tunnel"

cloudflared tunnel run 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "cloudflared.log") -Append
