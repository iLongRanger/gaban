# Outreach Bot Operator Runbook

## Daily Check

1. Open `https://bot.gleamlift.ca/dashboard`.
2. Confirm health is green.
3. Confirm `Last backup` shows today.
4. Check `Responses` for replies, bounces, or unsubscribes.
5. Log outcomes from the campaign detail page when a lead books a meeting, signs, or declines.

## Start Manually

From `A:\Projects\gaban`:

```powershell
cmd /c npm run build:web
cmd /c npm run start:web
```

In a separate PowerShell window:

```powershell
cloudflared tunnel run
```

## Install Auto-Start Tasks

From `A:\Projects\gaban`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-startup-tasks.ps1
```

Test without rebooting:

```powershell
schtasks /Run /TN "Gaban Bot Web"
schtasks /Run /TN "Gaban Cloudflare Tunnel"
```

Remove tasks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall-startup-tasks.ps1
```

## Logs

- App log: `logs\bot-web.log`
- Tunnel log: `logs\cloudflared.log`
- SQLite backups: `data\backups\YYYY-MM-DD.sqlite`

## Common Fixes

### Dashboard Says Gmail Is Missing

Check `.env` contains:

```text
GMAIL_OAUTH_CLIENT_ID
GMAIL_OAUTH_CLIENT_SECRET
GMAIL_OAUTH_REFRESH_TOKEN
GMAIL_SENDER_EMAIL
```

Restart the app after editing `.env`.

### Replies Are Not Detected

1. Confirm the app is running.
2. Confirm the Gmail account still has API access.
3. Wait up to 5 minutes for the response monitor.
4. Check `logs\bot-web.log` for Gmail API errors.

### Tunnel Down

Run:

```powershell
cloudflared tunnel run
```

If it fails, run:

```powershell
cloudflared tunnel list
cloudflared tunnel info
```

### Bot Was Off Overnight

On startup, the bot runs recovery automatically:

- Stale `sending` emails are marked failed for manual review.
- Missed sends are moved to the next valid send window.
- The dashboard shows the last worker gap.

### Restore From Backup

Stop the app first. Then copy the desired backup over `data\gaban.sqlite`.

```powershell
Copy-Item data\backups\YYYY-MM-DD.sqlite data\gaban.sqlite
```

Restart the app.
