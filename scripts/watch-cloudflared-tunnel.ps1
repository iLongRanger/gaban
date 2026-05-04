$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
$LogFile = Join-Path $LogDir "cloudflared-watchdog.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-WatchdogLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $LogFile -Encoding UTF8 -Value "[$timestamp] $Message"
}

$ExistingCloudflared = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ExistingCloudflared) {
  Write-WatchdogLog "cloudflared is running as PID $($ExistingCloudflared.Id)"
  exit 0
}

Write-WatchdogLog "cloudflared is not running; starting scheduled tunnel task"
$RunResult = schtasks /Run /TN "Gaban Cloudflare Tunnel" 2>&1
$RunExitCode = $LASTEXITCODE
Write-WatchdogLog "schtasks /Run exited ${RunExitCode}: $RunResult"
exit $RunExitCode
