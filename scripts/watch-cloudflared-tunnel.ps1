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

Write-WatchdogLog "cloudflared is not running; starting tunnel launcher"
$TunnelScript = Join-Path $RepoRoot "scripts\start-cloudflared-tunnel.ps1"
& $TunnelScript
$RunExitCode = $LASTEXITCODE
Write-WatchdogLog "tunnel launcher exited ${RunExitCode}"
exit $RunExitCode
