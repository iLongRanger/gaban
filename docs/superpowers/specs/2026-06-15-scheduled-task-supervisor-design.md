# Single Scheduled Task + Self-Healing Supervisor — Design Spec

**Date:** 2026-06-15
**Status:** Awaiting user review

## Problem

Gaban runs three services unattended at logon via three separate hidden Windows
scheduled tasks (`Gaban Bot Web`, `Gaban Bot Worker`, `Gaban Cloudflare Tunnel`) plus a
5-minute `Gaban Cloudflare Tunnel Watchdog`. The new `scripts/start-all.mjs` supervisor
already runs all three in one terminal with a live status dashboard — but only when
launched manually. The scheduled-task setup still uses the old three-task model, so the
unattended boot experience does not match the single-terminal dashboard.

## Goal

At logon, open **one visible console** running the supervisor's live status dashboard for
web + worker + tunnel, replacing the three hidden tasks and the watchdog. Make the
supervisor self-healing so it can be the always-on unattended runner.

## Scope

**In scope:** supervisor auto-restart; one `ONLOGON` task ("Gaban Bot") via a visible
wrapper; updates to install/uninstall/restart scripts; deleting the dead watchdog scripts.

**Out of scope:** changing how individual services are built; auto-build on logon (the task
assumes a prior `npm run build:web`, same contract as the current web task); non-Windows
service management.

## Behavior

- **One task:** a single visible `ONLOGON` task named **`Gaban Bot`** runs the supervisor in
  production mode (`next start`, not dev). The console window stays open on exit so errors
  are readable. The dashboard renders in color.
- **Self-healing:** if web/worker/tunnel exits unexpectedly, the supervisor relaunches it
  with exponential backoff (1s → 2s → 4s → … capped at 30s), appending to the same
  `logs/<name>.log`. The restart counter resets after the service stays healthy ~60s.
- **Permanent failures:** a spawn failure meaning a missing binary (ENOENT, e.g. cloudflared
  not installed) is shown as `✗ failed` and is **not** retried — no infinite respawn loop.
- **Shutdown:** during Ctrl+C / task stop, child exits are expected and never trigger a
  restart; the supervisor tree-kills all children (existing behavior).

## Architecture & Components

### 1. `scripts/start-all.mjs` — add supervision
- Per-service state gains `restartCount`, `nextRestartAt`, `healthySince`, and a
  `permanentlyFailed` flag.
- Child `exit` handler: if not shutting down and not a permanent failure, set status to
  `restarting`, increment `restartCount`, and set `nextRestartAt = now + backoff(restartCount)`
  where `backoff(n) = min(1000 * 2**(n-1), 30000)`.
- Child `error` handler with `ENOENT` (or the existing synchronous spawn-throw path): set
  `permanentlyFailed = true` so the service shows `✗ failed` and is never relaunched.
- Tick loop: if a service has exited, is not permanently failed, not shutting down, and
  `now >= nextRestartAt`, relaunch it (re-runs `startService`, which clears `exitCode`).
- Health reset: when a service's check is OK and it has been continuously healthy for ~60s,
  reset `restartCount` to 0.
- Dashboard: add a `restarting` status rendered as `⚠ <name>  restarting (attempt N)…`
  (yellow). One line per service; fixed dashboard height unchanged.

### 2. `scripts/start-all.ps1` — visible wrapper (new)
- `cd` to repo root, set `NEXT_TELEMETRY_DISABLED=1` (do **not** set `NO_COLOR`; the dashboard
  needs color — children already get `NO_COLOR` from the supervisor).
- Run `node scripts/start-all.mjs`. On exit, print the exit code and `Read-Host` to keep the
  window open. Mirrors `start-bot-web.ps1` but visible and color-enabled.

### 3. `scripts/install-startup-tasks.ps1`
- Register one task: `schtasks /Create /TN "Gaban Bot" /SC ONLOGON /RL LIMITED /F` pointing at
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-all.ps1` (no
  `-WindowStyle Hidden`, no `Hidden=true` — visible).
- Remove registration of `Gaban Bot Web`, `Gaban Bot Worker`, `Gaban Cloudflare Tunnel`, and
  `Gaban Cloudflare Tunnel Watchdog`.

### 4. `scripts/uninstall-startup-tasks.ps1`
- Delete `Gaban Bot` plus the four legacy task names (idempotent / best-effort), so a machine
  with the old setup migrates cleanly.

### 5. `scripts/restart-all.ps1`
- Stop/kill + start a single `Gaban Bot` task instead of three. Keep killing lingering Gaban
  node processes, the `.next` clean + `build:web` rebuild, and the final `await-services.mjs`
  status check (which independently probes web/worker/tunnel and still applies).

### 6. Deletions
- Delete `scripts/watch-cloudflared-tunnel.ps1` and `scripts/watch-cloudflared-tunnel-hidden.vbs`
  (dead once the watchdog task is gone).
- Keep `start-bot-web.ps1`, `start-bot-worker.ps1`, `start-cloudflared-tunnel.ps1` for manual
  single-service runs.

## Error Handling

- Missing build (`.next`): `next start` fails and the web service shows `✗`/restarts; same
  limitation as today. Resolved by running `build:web` (or `restart-all.ps1`).
- Missing cloudflared binary: tunnel shows `✗ failed`, no respawn loop.
- Repeated crashes: backoff caps at 30s; restarts continue indefinitely (unattended runner).

## Testing

This is Windows ops glue (scheduled tasks, PowerShell wrappers, a process supervisor),
consistent with the existing untested `scripts/` directory. No unit tests added — same
convention as `await-services.mjs` and the current `.ps1` task scripts. Verification is
manual and observational:
- Run `npm run dev:all`, kill one child process, and confirm the dashboard shows
  `⚠ restarting…` then `✓`, and a single log file keeps appending.
- Confirm Ctrl+C still tree-kills everything with no orphan (already verified for the
  non-restarting version).
- `install-startup-tasks.ps1` then `schtasks /Run /TN "Gaban Bot"` brings up one visible
  dashboard window; `uninstall-startup-tasks.ps1` removes new + legacy tasks.

## Out-of-scope / deferred

- Auto-building the web app on logon.
- A separate pull-style `npm run status` command (the always-on visible dashboard covers it).
- Cross-platform (systemd/launchd) equivalents.
