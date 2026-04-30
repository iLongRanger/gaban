$ErrorActionPreference = "Continue"

schtasks /Delete /TN "Gaban Bot Web" /F
schtasks /Delete /TN "Gaban Cloudflare Tunnel" /F

Write-Host "Removed Gaban startup tasks if they existed."
