$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path (Join-Path $LogDir "cloudflared.log") -Value "[$timestamp] Starting Cloudflare tunnel"

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

& $Cloudflared tunnel run 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "cloudflared.log") -Append
