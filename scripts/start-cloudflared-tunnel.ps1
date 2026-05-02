$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "cloudflared.log"
$ConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-CloudflaredLog {
  param([string]$Message)
  Add-Content -Path $LogFile -Value $Message -Encoding UTF8
}

Write-CloudflaredLog "[$timestamp] Starting Cloudflare tunnel"

$ExistingCloudflared = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ExistingCloudflared) {
  Write-CloudflaredLog "[$timestamp] cloudflared already running as PID $($ExistingCloudflared.Id)"
  exit 0
}

$CloudflaredCandidates = @(
  "C:\Program Files\cloudflared\cloudflared.exe",
  "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  "cloudflared"
)

$Cloudflared = $CloudflaredCandidates | ForEach-Object {
  if ($_ -eq "cloudflared") {
    $Command = Get-Command $_ -ErrorAction SilentlyContinue
    if ($Command) {
      $Command.Source
    }
  } else {
    if (Test-Path $_) {
      $_
    }
  }
} | Select-Object -First 1

if (-not $Cloudflared) {
  throw "cloudflared.exe was not found. Install Cloudflare cloudflared or add it to PATH."
}

if (-not (Test-Path $ConfigPath)) {
  throw "Cloudflare config was not found at $ConfigPath."
}

Write-CloudflaredLog "[$timestamp] Using $Cloudflared"
Write-CloudflaredLog "[$timestamp] Using config $ConfigPath"

& $Cloudflared tunnel --config $ConfigPath run 2>&1 | ForEach-Object {
  Write-CloudflaredLog $_.ToString()
}
exit $LASTEXITCODE
