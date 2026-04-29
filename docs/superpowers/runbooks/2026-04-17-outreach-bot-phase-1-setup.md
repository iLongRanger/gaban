# Outreach Bot - Phase 1 Setup Runbook

> Manual infrastructure setup that must be done before the outreach bot can send real email.
> This version uses Google Workspace / Gmail API as the primary sender.

**Decision locked in:** Use Google Workspace Business Starter for `gleamlift.ca` if Google allows it. Create one mailbox: `outreach@gleamlift.ca`. Keep Cloudflare Tunnel for public unsubscribe links at `https://bot.gleamlift.ca`.

---

## Stage 1 - Create Google Workspace Starter

1. Go to https://workspace.google.com/pricing.
2. Start **Business Starter** for `gleamlift.ca`.
3. Create the user:

   ```text
   First name: GleamPro
   Last name: Outreach
   Email: outreach@gleamlift.ca
   ```

4. Confirm you can sign in to https://mail.google.com as `outreach@gleamlift.ca`.

### Verify

- [ ] Google Workspace tenant exists for `gleamlift.ca`.
- [ ] `outreach@gleamlift.ca` can sign in to Gmail.
- [ ] Mailbox can receive a test email.

---

## Stage 2 - Move Mail DNS To Google

Only do this after you are ready to stop using Microsoft for `gleamlift.ca` mail.

In Cloudflare DNS for `gleamlift.ca`, replace Microsoft mail records with Google Workspace records.

### MX

Use Google's Workspace MX records shown in Google Admin. Google commonly uses:

```text
smtp.google.com
```

If Google Admin gives the legacy 5-record set, use exactly what it provides.

### SPF

Set a single SPF TXT record at the root:

```text
v=spf1 include:_spf.google.com -all
```

Do not keep the Microsoft SPF include once sending is moved to Google, unless you intentionally keep Microsoft as an authorized sender too.

### DKIM

1. Google Admin: https://admin.google.com
2. **Apps** -> **Google Workspace** -> **Gmail** -> **Authenticate email**
3. Select `gleamlift.ca`.
4. Generate a 2048-bit DKIM key.
5. Add the TXT record Google provides in Cloudflare.
6. Return to Google Admin and click **Start authentication**.

### DMARC

Keep or update `_dmarc.gleamlift.ca`:

```text
v=DMARC1; p=none; rua=mailto:dmarc-rortiz@gleamlift.ca
```

### Verify

- [ ] MX points to Google.
- [ ] SPF includes `_spf.google.com`.
- [ ] Google DKIM is authenticated.
- [ ] DMARC exists.

---

## Stage 3 - Google Cloud OAuth For Gmail API

1. Go to https://console.cloud.google.com.
2. Create/select project: `gaban-outreach`.
3. Enable **Gmail API**.
4. Configure OAuth consent screen:
   - User type: Internal if available in Workspace.
   - App name: `Gaban Outreach Bot`
   - Support/developer email: your admin email.
5. Add Gmail API scope:

   ```text
   https://www.googleapis.com/auth/gmail.send
   ```

   Later reply polling may also need:

   ```text
   https://www.googleapis.com/auth/gmail.readonly
   ```

6. Create OAuth client:
   - Application type: **Desktop app**
   - Name: `Gaban local bot`
7. Save:

   ```dotenv
   GMAIL_OAUTH_CLIENT_ID=...
   GMAIL_OAUTH_CLIENT_SECRET=...
   ```

---

## Stage 4 - Generate Gmail Refresh Token

Use OAuth Playground:

1. Open https://developers.google.com/oauthplayground.
2. Gear icon -> enable **Use your own OAuth credentials**.
3. Paste the Google OAuth client ID and secret.
4. In scopes, enter:

   ```text
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   ```

5. Authorize APIs.
6. Sign in as:

   ```text
   outreach@gleamlift.ca
   ```

7. Exchange authorization code for tokens.
8. Copy the refresh token:

   ```dotenv
   GMAIL_OAUTH_REFRESH_TOKEN=...
   ```

---

## Stage 5 - Cloudflare Tunnel

Keep the current tunnel:

```text
PUBLIC_APP_URL=https://bot.gleamlift.ca
LOCAL_APP_PORT=3010
```

Config should remain:

```yaml
tunnel: 1f87b14a-f49d-4ae6-9d34-cfbb0f629519
credentials-file: C:\Users\rorti\.cloudflared\1f87b14a-f49d-4ae6-9d34-cfbb0f629519.json

ingress:
  - hostname: bot.gleamlift.ca
    service: http://localhost:3010
  - service: http_status:404
```

Verify:

```text
https://bot.gleamlift.ca/u/garbage-token
```

Expected: unsubscribe error page.

---

## Stage 6 - Populate `.env`

```dotenv
GMAIL_OAUTH_CLIENT_ID=<client id>
GMAIL_OAUTH_CLIENT_SECRET=<client secret>
GMAIL_OAUTH_REFRESH_TOKEN=<refresh token>
GMAIL_SENDER_EMAIL=outreach@gleamlift.ca
GMAIL_SENDER_NAME=GleamPro Cleaning

UNSUBSCRIBE_TOKEN_SECRET=<random 32-byte base64>
PUBLIC_APP_URL=https://bot.gleamlift.ca

BUSINESS_LEGAL_NAME=Gleam & Lift Solutions
BUSINESS_OPERATING_NAME=GleamPro Cleaning
BUSINESS_MAILING_ADDRESS=Set 6 - 1209 Fourth Avenue, New Westminster, BC V3M 1T8
```

Generate unsubscribe token secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Verify `.env` is ignored:

```powershell
git check-ignore .env
```

---

## Final Smoke Test

```powershell
cd A:\Projects\gaban
cmd /c node scripts\smoke-send.mjs rortiz0305@gmail.com
```

Expected:

- Gmail API returns a message/thread ID.
- Email arrives.
- SPF, DKIM, and DMARC pass.
- Unsubscribe link opens `https://bot.gleamlift.ca/u/<token>`.
