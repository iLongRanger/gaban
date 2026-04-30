$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$WebScript = Join-Path $RepoRoot "scripts\start-bot-web.ps1"
$TunnelScript = Join-Path $RepoRoot "scripts\start-cloudflared-tunnel.ps1"

Write-Host "Installing Gaban startup tasks..."

schtasks /Create /TN "Gaban Bot Web" /SC ONLOGON /RL LIMITED /F /TR "`"$PowerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$WebScript`""
schtasks /Create /TN "Gaban Cloudflare Tunnel" /SC ONLOGON /RL LIMITED /F /TR "`"$PowerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$TunnelScript`""

Write-Host "Installed:"
Write-Host "  Gaban Bot Web"
Write-Host "  Gaban Cloudflare Tunnel"
Write-Host ""
Write-Host "Run these once to test without rebooting:"
Write-Host "  schtasks /Run /TN `"Gaban Bot Web`""
Write-Host "  schtasks /Run /TN `"Gaban Cloudflare Tunnel`""
