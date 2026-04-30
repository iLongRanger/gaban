$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path (Join-Path $LogDir "cloudflared.log") -Value "[$timestamp] Starting Cloudflare tunnel"

$ExistingCloudflared = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ExistingCloudflared) {
  Add-Content -Path (Join-Path $LogDir "cloudflared.log") -Value "[$timestamp] cloudflared already running as PID $($ExistingCloudflared.Id)"
  exit 0
}

$CloudflaredCandidates = @(
  "C:\Program Files\cloudflared\cloudflared.exe",
  "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  "cloudflared"
)

$Cloudflared = $CloudflaredCandidates | Where-Object {
  if ($_ -eq "cloudflared") {
    Get-Command $_ -ErrorAction SilentlyContinue
  } else {
    Test-Path $_
  }
} | Select-Object -First 1

if (-not $Cloudflared) {
  throw "cloudflared.exe was not found. Install Cloudflare cloudflared or add it to PATH."
}

Add-Content -Path (Join-Path $LogDir "cloudflared.log") -Value "[$timestamp] Using $Cloudflared"
& $Cloudflared tunnel run --config "$env:USERPROFILE\.cloudflared\config.yml" 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "cloudflared.log") -Append
exit $LASTEXITCODE
