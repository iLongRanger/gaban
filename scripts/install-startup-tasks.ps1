$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$WebScript = Join-Path $RepoRoot "scripts\start-bot-web.ps1"
$TunnelScript = Join-Path $RepoRoot "scripts\start-cloudflared-tunnel.ps1"
$TunnelWatchdogScript = Join-Path $RepoRoot "scripts\watch-cloudflared-tunnel.ps1"

Write-Host "Installing Gaban startup tasks..."

schtasks /Create /TN "Gaban Bot Web" /SC ONLOGON /RL LIMITED /F /TR "`"$PowerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$WebScript`""
schtasks /Create /TN "Gaban Cloudflare Tunnel" /SC ONLOGON /RL LIMITED /F /TR "`"$PowerShell`" -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$TunnelScript`""
schtasks /Create /TN "Gaban Cloudflare Tunnel Watchdog" /SC MINUTE /MO 5 /RL LIMITED /F /TR "`"$PowerShell`" -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$TunnelWatchdogScript`""

try {
  $TunnelTask = Get-ScheduledTask -TaskName "Gaban Cloudflare Tunnel"
  $TunnelTask.Settings.Hidden = $true
  Set-ScheduledTask -InputObject $TunnelTask | Out-Null
} catch {
  Write-Warning "Could not set the tunnel task Hidden flag. The task still uses -WindowStyle Hidden."
}

try {
  $WatchdogTask = Get-ScheduledTask -TaskName "Gaban Cloudflare Tunnel Watchdog"
  $WatchdogTask.Settings.Hidden = $true
  Set-ScheduledTask -InputObject $WatchdogTask | Out-Null
} catch {
  Write-Warning "Could not set the watchdog task Hidden flag. The task still uses -WindowStyle Hidden."
}

Write-Host "Installed:"
Write-Host "  Gaban Bot Web"
Write-Host "  Gaban Cloudflare Tunnel"
Write-Host "  Gaban Cloudflare Tunnel Watchdog"
Write-Host ""
Write-Host "Run these once to test without rebooting:"
Write-Host "  schtasks /Run /TN `"Gaban Bot Web`""
Write-Host "  schtasks /Run /TN `"Gaban Cloudflare Tunnel`""
Write-Host "  schtasks /Run /TN `"Gaban Cloudflare Tunnel Watchdog`""
