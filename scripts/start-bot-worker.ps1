$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot "logs"
$LogFile = Join-Path $LogDir "bot-worker.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$ExistingWorker = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*src/worker/background.js*" } |
  Select-Object -First 1

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($ExistingWorker) {
  Add-Content -Path $LogFile -Encoding utf8 -Value "[$timestamp] Gaban background worker already running as PID $($ExistingWorker.ProcessId)"
  exit 0
}

Set-Location $RepoRoot
Add-Content -Path $LogFile -Encoding utf8 -Value "[$timestamp] Starting Gaban background worker"

$env:NO_COLOR = "1"
$env:FORCE_COLOR = "0"

& cmd /d /s /c "npm run start:worker 2>&1" | ForEach-Object {
  Add-Content -Path $LogFile -Encoding utf8 -Value $_
}

$exit = $LASTEXITCODE
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Encoding utf8 -Value "[$timestamp] Gaban background worker exited with code $exit"
exit $exit
