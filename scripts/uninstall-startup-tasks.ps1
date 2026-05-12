$ErrorActionPreference = "Continue"

schtasks /Delete /TN "Gaban Bot Web" /F
schtasks /Delete /TN "Gaban Bot Worker" /F
schtasks /Delete /TN "Gaban Cloudflare Tunnel" /F
schtasks /Delete /TN "Gaban Cloudflare Tunnel Watchdog" /F

Write-Host "Removed Gaban startup tasks if they existed."
