$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

# 1. Stop scheduled tasks (best effort).
Write-Step "Stopping scheduled tasks"
foreach ($task in @("Gaban Bot Web", "Gaban Bot Worker", "Gaban Cloudflare Tunnel")) {
  try { schtasks /End /TN $task 2>$null | Out-Null; Write-Host "  stopped: $task" } catch {}
}

# 2. Kill any lingering Gaban node processes (children of the npm scripts above).
Write-Step "Killing lingering Gaban node processes"
$gabanProcs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*src/worker/background.js*" -or
      $_.CommandLine -like "*next*src/web*" -or
      $_.CommandLine -like "*start:web*" -or
      $_.CommandLine -like "*start:worker*"
    )
  }
foreach ($p in $gabanProcs) {
  Write-Host ("  killing PID {0}" -f $p.ProcessId)
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
}

# 3. Clear stale Next.js build cache and rebuild.
Write-Step "Rebuilding web (clears stale chunks)"
Set-Location $RepoRoot
$nextDir = Join-Path $RepoRoot "src\web\.next"
if (Test-Path $nextDir) { Remove-Item -Recurse -Force $nextDir }
& cmd /d /s /c "npm run build:web"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Aborting restart." -ForegroundColor Red
  exit $LASTEXITCODE
}

# 4. Start scheduled tasks again.
Write-Step "Starting scheduled tasks"
foreach ($task in @("Gaban Bot Web", "Gaban Bot Worker", "Gaban Cloudflare Tunnel")) {
  try { schtasks /Run /TN $task | Out-Null; Write-Host "  started: $task" } catch { Write-Warning ("  failed to start: {0}" -f $task) }
}

Write-Step "Waiting for services to come up"
& node (Join-Path $PSScriptRoot "await-services.mjs")

Write-Host ""
Write-Host "Web:    http://localhost:3010"
Write-Host "Logs:   $RepoRoot\logs\bot-web.log, bot-worker.log"
