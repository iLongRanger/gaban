# Outreach Bot — Phase 1 Setup Runbook

> Manual infrastructure setup that must be done **before** the Phase 2 code can send a real email.
> Do these stages in order. Each one has a verification step — don't skip.

**Decision locked in:** Add a separate Business Starter subscription ($7/mo) to the existing Workspace org and assign it to a new user. New user lives on the subdomain `outreach.gleampro.ca` for reputation isolation.

---

## Stage 1 — Add a Business Starter license + create the user

Your existing Workspace org is on a higher tier (Business Standard / Plus). New users default to that tier, which is why adding one cost ~$22/mo. Fix: buy a second subscription on the Starter SKU and assign that license to just the outreach user.

### 1a. Buy the Starter subscription

1. Go to **https://admin.google.com** → sign in as the Workspace admin.
2. Left nav: **Billing → Get more services**.
3. Find **Google Workspace** in the catalog → click → choose **Business Starter** → **Add it now / Get started**.
4. Pick **Flexible plan** (pay per user per month, easy to cancel).
5. **Number of users: 1**.
6. Confirm.

You should now see two subscriptions under **Billing → Subscriptions**: your existing one and a new Starter (1 seat, $7/mo).

### 1b. Create the user (after Stage 2 finishes — see note)

⚠️ Skip ahead to Stage 2 first to create the subdomain. Then come back here.

7. **Directory → Users → Add new user**.
8. Fill in:
   - First name: `Outreach`
   - Last name: `Bot`
   - Primary email: `outreach@outreach.gleampro.ca` (the subdomain dropdown will appear after Stage 2 verifies)
   - Password: pick anything; we'll never use it directly
   - **Uncheck** "Ask for a password change at next sign-in"
9. Save.

### 1c. Assign the Starter license to that user

10. Click the new user `outreach@outreach.gleampro.ca` in the Users list.
11. Scroll to **Licenses** → click it.
12. Toggle **Business Standard/Plus → OFF**.
13. Toggle **Business Starter → ON**.
14. Save.

### Verify

- [ ] Open **mail.google.com** in an incognito window and sign in as `outreach@outreach.gleampro.ca`. You should reach the Gmail inbox.
- [ ] In admin console **Billing → Subscriptions**, confirm both subscriptions exist and Starter shows 1/1 seats used.

---

## Stage 2 — Add `outreach.gleampro.ca` as a secondary domain

A Workspace org can own multiple domains under one subscription. We're adding the subdomain so it can host the `outreach@` mailbox separate from your main domain.

1. **admin.google.com** → **Account → Domains → Manage domains**.
2. **Add a domain**.
3. Choose **Secondary domain** (NOT "domain alias" — alias would forward to your existing user; we want a separate mailbox).
4. Enter: `outreach.gleampro.ca`
5. **Continue and verify domain ownership**.
6. Google shows a **TXT record** to add at your DNS provider. Looks like:
   ```
   Host:   outreach   (or outreach.gleampro.ca depending on provider UX)
   Type:   TXT
   Value:  google-site-verification=xxxxxxxxxxxxxxxxxxxxxxx
   ```
7. **Copy the TXT value** — paste it into your DNS provider next.

### Add the TXT record at your DNS provider

Open your DNS provider in a separate tab.

- **Cloudflare:** DNS → Records → Add record → Type `TXT`, Name `outreach`, Content the verification string, Proxy status **DNS only** (gray cloud), TTL Auto. Save.
- **Squarespace / former Google Domains:** DNS → Custom records → Add → Type `TXT`, Host `outreach`, Data the verification string. Save.
- **GoDaddy:** DNS → Add record → Type `TXT`, Name `outreach`, Value the verification string. Save.
- **Namecheap:** Advanced DNS → Add new record → `TXT Record`, Host `outreach`, Value the verification string. Save.

### Verify propagation

```bash
nslookup -type=TXT outreach.gleampro.ca 8.8.8.8
```

Expected: the `google-site-verification=...` string appears in output. Wait 1–5 minutes if not. (Up to 1 hour for slow providers.)

### Tell Workspace to verify

8. Back in admin console: click **Verify**.
9. Status changes to **Verified**.

### Now finish Stage 1b/c above

- [ ] User `outreach@outreach.gleampro.ca` exists, signs into Gmail, has Starter license assigned.

---

## Stage 3 — Publish SPF / DKIM / DMARC for the subdomain

These three DNS records authenticate mail sent from `outreach.gleampro.ca`. Without them, recipient servers will mark your messages as suspicious or spam.

### 3a. MX records (so the subdomain can receive mail too — required by Workspace)

Add these MX records on `outreach.gleampro.ca`:

| Priority | Host       | Value                |
|---------:|------------|----------------------|
| 1        | outreach   | smtp.google.com      |

(Modern Workspace uses just one MX. If your provider asks for the legacy 5-record set: priorities 1/5/5/10/10 pointing to `aspmx.l.google.com`, `alt1.aspmx.l.google.com`, `alt2.aspmx.l.google.com`, `alt3.aspmx.l.google.com`, `alt4.aspmx.l.google.com`. Either works.)

Verify:
```bash
nslookup -type=MX outreach.gleampro.ca 8.8.8.8
```

### 3b. SPF record

Add ONE TXT record on the subdomain authorizing Google to send for it:

| Type | Host     | Value                                    |
|------|----------|------------------------------------------|
| TXT  | outreach | `v=spf1 include:_spf.google.com ~all`    |

If a TXT record already exists on `outreach`, do NOT add a second SPF — combine them. SPF allows only one record per host.

Verify:
```bash
nslookup -type=TXT outreach.gleampro.ca 8.8.8.8
```
Expected: includes `v=spf1 include:_spf.google.com ~all`.

### 3c. DKIM record

DKIM is generated by Workspace, not you. You publish what it gives you.

1. **admin.google.com** → **Apps → Google Workspace → Gmail → Authenticate email**.
2. Top dropdown: select **outreach.gleampro.ca**.
3. Click **Generate new record**. Choose **2048-bit** key, prefix `google` (default).
4. Workspace shows you a TXT record like:
   ```
   Host:   google._domainkey.outreach   (or google._domainkey.outreach.gleampro.ca)
   Type:   TXT
   Value:  v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...long...IDAQAB
   ```
   The value is long (~400 characters). Copy it whole.
5. Add that TXT record at your DNS provider on host `google._domainkey.outreach`.
6. Wait 5 minutes for DNS propagation.
7. Back in Workspace: click **Start authentication**. Status should change to "Authenticating email" then "Authenticated".

Verify:
```bash
nslookup -type=TXT google._domainkey.outreach.gleampro.ca 8.8.8.8
```

### 3d. DMARC record

Tells receiving servers what to do if SPF or DKIM fail, and where to send aggregate reports.

| Type | Host                | Value                                                                         |
|------|---------------------|-------------------------------------------------------------------------------|
| TXT  | _dmarc.outreach     | `v=DMARC1; p=none; rua=mailto:dmarc-reports@gleampro.ca; fo=1; adkim=s; aspf=s` |

- `p=none` for the first 30 days while we monitor — get reports without breaking anything.
- After ~30 days of clean reports, change to `p=quarantine`. After another month, `p=reject`.
- Replace `dmarc-reports@gleampro.ca` with whatever inbox you want the daily aggregate JSON sent to — your main address is fine.

Verify:
```bash
nslookup -type=TXT _dmarc.outreach.gleampro.ca 8.8.8.8
```

### Stage 3 verification checklist

- [ ] MX returns `smtp.google.com` (or the legacy 5-record set)
- [ ] SPF TXT contains `v=spf1 include:_spf.google.com`
- [ ] DKIM TXT exists at `google._domainkey.outreach.gleampro.ca`
- [ ] DMARC TXT exists at `_dmarc.outreach.gleampro.ca`
- [ ] Workspace **Authenticate email** page shows status = "Authenticated"

---

## Stage 4 — Google Cloud project + Gmail API + OAuth credentials

The bot uses the Gmail API, which requires an OAuth2 Client ID from Google Cloud.

### 4a. Create the Cloud project

1. Go to **https://console.cloud.google.com** signed in as the Workspace admin (any account in your org works).
2. Top bar: project picker → **New Project**.
3. Name: `gleampro-outreach`.
4. Organization: `gleampro.ca` (your Workspace org).
5. Create. Wait for the project to appear, then switch to it.

### 4b. Enable the Gmail API

6. Left nav (hamburger): **APIs & Services → Library**.
7. Search **Gmail API** → click it → **Enable**.

### 4c. Configure the OAuth consent screen

8. Left nav: **APIs & Services → OAuth consent screen**.
9. User type: **Internal** (only people in your Workspace org can authorize — perfect for our bot, since the bot user is in the org).
10. **Create**.
11. Fill in:
    - App name: `Gleam Pro Outreach Bot`
    - User support email: your admin email
    - App logo: skip
    - Developer contact: your admin email
12. **Save and continue**.
13. **Scopes**: click **Add or remove scopes** → search for and tick:
    - `https://www.googleapis.com/auth/gmail.send`
    - `https://www.googleapis.com/auth/gmail.readonly`
14. **Update → Save and continue**.
15. Test users: skip (Internal apps don't need them).
16. **Back to dashboard**.

### 4d. Create OAuth Client ID

17. Left nav: **APIs & Services → Credentials**.
18. **Create credentials → OAuth client ID**.
19. Application type: **Desktop app**.
20. Name: `Outreach bot CLI`.
21. **Create**.
22. A modal shows **Client ID** and **Client secret**. **Copy both** into a temporary safe place — we'll put them in `.env` in Stage 6. The secret is shown ONLY once via the modal; you can also re-download the JSON later.
23. Click **Download JSON** as a backup; save it outside the repo (e.g., `~/Documents/gleampro-oauth-credentials.json`). Do not commit this file.

### Stage 4 verification

- [ ] Project `gleampro-outreach` exists in Cloud Console
- [ ] Gmail API shows "Enabled" status
- [ ] OAuth consent screen status: "In production" (Internal apps publish automatically)
- [ ] OAuth Client ID + Client secret saved somewhere safe

---

## Stage 5 — Generate the OAuth refresh token

The refresh token lets the bot mint short-lived access tokens forever without a human re-logging in.

Use Google's OAuth Playground — easiest path, no extra code needed.

1. Open **https://developers.google.com/oauthplayground** in an incognito window.
2. Top right: gear icon (⚙️) → tick **Use your own OAuth credentials**.
3. Paste the **OAuth Client ID** and **Client secret** from Stage 4d. Close the gear.
4. Left panel "Step 1 — Select & authorize APIs":
   - In the input box, manually paste these two scopes (one per line):
     ```
     https://www.googleapis.com/auth/gmail.send
     https://www.googleapis.com/auth/gmail.readonly
     ```
   - Click **Authorize APIs**.
5. Google's login screen appears. **Sign in as `outreach@outreach.gleampro.ca`** (NOT your admin account — the refresh token is bound to whoever logs in here).
6. Approve the consent screen (you'll see "Gleam Pro Outreach Bot wants access to..."). Click **Continue / Allow**.
7. Back at OAuth Playground "Step 2 — Exchange authorization code for tokens":
   - Click **Exchange authorization code for tokens**.
8. The right panel now shows:
   - Access token (short-lived; ignore)
   - **Refresh token** — long string starting with `1//`
9. **Copy the refresh token** to your safe place.

### Important: don't ever re-run this

Each time you grant consent, Google issues a new refresh token and (depending on settings) may revoke the previous one. If you run this twice, the first token may stop working. If you do need to regenerate (e.g., the user's password changes drastically or you revoke access), simply repeat Stage 5.

### Stage 5 verification

- [ ] You have a refresh token starting with `1//` saved alongside the Client ID and Secret

---

## Stage 6 — Cloudflare Tunnel: route `outreach.gleampro.ca` → your local PC

This makes the unsubscribe page reachable from the public internet without opening firewall ports. The bot runs on your PC; Cloudflare proxies HTTPS traffic in.

**Prerequisite:** a free Cloudflare account, with `gleampro.ca` already added to it (DNS-only is fine — you don't need to be using Cloudflare proxy for the apex). If your DNS is at a different provider, you can still use Cloudflare Tunnel: you'll add a CNAME at your existing DNS provider pointing to the tunnel. Both paths work.

### 6a. Install cloudflared on your PC (Windows)

```powershell
# Open PowerShell as Administrator
winget install --id Cloudflare.cloudflared
```

After install, open a new terminal and verify:
```bash
cloudflared --version
```

### 6b. Authenticate cloudflared

```bash
cloudflared tunnel login
```

A browser window opens. Sign in to Cloudflare. Pick the zone `gleampro.ca`. Cloudflared writes a cert file (`~/.cloudflared/cert.pem` on Mac/Linux, `%USERPROFILE%\.cloudflared\cert.pem` on Windows).

### 6c. Create the tunnel

```bash
cloudflared tunnel create gleampro-outreach
```

Output includes a tunnel UUID and writes credentials to `~/.cloudflared/<UUID>.json`. Copy the UUID — you need it next.

### 6d. Configure the tunnel

Create `~/.cloudflared/config.yml` (Mac/Linux) or `%USERPROFILE%\.cloudflared\config.yml` (Windows):

```yaml
tunnel: <UUID-FROM-STEP-6c>
credentials-file: C:\Users\<your-user>\.cloudflared\<UUID-FROM-STEP-6c>.json

ingress:
  - hostname: outreach.gleampro.ca
    service: http://localhost:3000
  - service: http_status:404
```

### 6e. Route DNS to the tunnel

```bash
cloudflared tunnel route dns gleampro-outreach outreach.gleampro.ca
```

This auto-creates a CNAME on Cloudflare DNS pointing `outreach.gleampro.ca` → `<UUID>.cfargotunnel.com`.

⚠️ **DNS provider conflict:** if you already added an MX, SPF, DKIM, or DMARC record on `outreach.gleampro.ca` at a different DNS provider in Stage 3, Cloudflare needs to be authoritative for the subdomain. You have two options:

**Option 1 — keep DNS where it is, add only the CNAME at the existing provider:**
1. At your existing DNS provider, add a CNAME: Host `outreach`, Target `<UUID>.cfargotunnel.com`.
2. Don't run `cloudflared tunnel route dns` — the CNAME is enough.

**Option 2 — move the subdomain to Cloudflare entirely:**
- More involved; only pick this if you're already a Cloudflare user. The MX, SPF, DKIM, DMARC records need to be re-published on Cloudflare for the subdomain.

For most setups, Option 1 is simpler.

### 6f. Run the tunnel

In a long-running terminal (keep it open or run as a service later):

```bash
cloudflared tunnel run gleampro-outreach
```

In a separate terminal, start the Next.js dev server:

```bash
cd src/web
npm run dev
```

### 6g. Verify the public URL works

From any device that's NOT on your local network (use your phone on cell data, or **https://www.whatismyip.com** style site), open:

```
https://outreach.gleampro.ca
```

You should see the Next.js app login page.

Test a 404:
```
https://outreach.gleampro.ca/u/garbage-token
```

You should see the "We couldn't process that unsubscribe link" page from the Phase 2 code.

### Run cloudflared as a Windows service (so it survives reboot)

Once verified working, install as a service:

```powershell
# Run as Administrator
cloudflared service install
```

It now starts automatically when Windows boots.

### Stage 6 verification

- [ ] `cloudflared --version` returns a version
- [ ] Tunnel `gleampro-outreach` exists (`cloudflared tunnel list`)
- [ ] DNS `outreach.gleampro.ca` resolves to a `cfargotunnel.com` CNAME
- [ ] Visiting `https://outreach.gleampro.ca/u/garbage-token` from an external device shows the unsubscribe error page
- [ ] Service is installed and survives a reboot

---

## Stage 7 — Populate `.env`

Final step. Open `.env` at the repo root (create from `.env.example` if it doesn't exist) and fill in the new variables.

```dotenv
# Gmail API (from Stage 4d and Stage 5)
GMAIL_OAUTH_CLIENT_ID=<paste from Stage 4d>
GMAIL_OAUTH_CLIENT_SECRET=<paste from Stage 4d>
GMAIL_OAUTH_REFRESH_TOKEN=<paste from Stage 5 — starts with 1//>
GMAIL_SENDER_EMAIL=outreach@outreach.gleampro.ca
GMAIL_SENDER_NAME=GleamPro Cleaning

# Unsubscribe token secret (generate fresh, never reuse)
UNSUBSCRIBE_TOKEN_SECRET=<run the command below to generate>

# Public app URL (from Stage 6)
PUBLIC_APP_URL=https://outreach.gleampro.ca

# CASL footer business identity
BUSINESS_LEGAL_NAME=Gleam & Lift Solutions
BUSINESS_OPERATING_NAME=GleamPro Cleaning
BUSINESS_MAILING_ADDRESS=Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8
```

Generate the unsubscribe token secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output into `UNSUBSCRIBE_TOKEN_SECRET`.

### Stage 7 verification

- [ ] `.env` exists at repo root and is in `.gitignore` (it should be — verify with `git check-ignore .env`)
- [ ] All 10 new variables are set with non-placeholder values

---

## Final smoke test (Phase 2 Task 9)

After all of Phase 1 is green, run the smoke test from the Phase 2 plan to confirm an end-to-end real send works:

```bash
node scripts/smoke-send.mjs your-personal-email@example.com
```

Expected:
- Console logs `Sent: { gmail_message_id: ..., gmail_thread_id: ... }`
- The email arrives at your personal inbox within 30 seconds
- Sender shows as `GleamPro Cleaning <outreach@outreach.gleampro.ca>`
- Email passes Gmail's "Show original" check: SPF=PASS, DKIM=PASS, DMARC=PASS
- The CASL footer is present
- Clicking the unsubscribe link opens `https://outreach.gleampro.ca/u/<token>` and shows the error page (sendId=999999 doesn't exist in DB — that's expected and proves the route works)

If any of those checks fail, see the Troubleshooting section below.

---

## Troubleshooting

### "Domain not verified" when adding the user
- DNS hasn't propagated. Wait 5 more minutes and try `nslookup -type=TXT outreach.gleampro.ca 8.8.8.8` again.

### Workspace says DKIM is "Not authenticating"
- The TXT value got truncated when you pasted it. Many DNS UIs split values >255 characters into multiple strings — that's fine, but the COMBINED value must match exactly. Compare character by character.
- The host is `google._domainkey.outreach` (NOT just `_domainkey` or `google._domainkey`).
- Wait 24 hours. Sometimes Workspace's verification job is slow.

### OAuth Playground returns "invalid_grant" when fetching tokens
- You signed in as the wrong user. Sign out and re-do Stage 5 as `outreach@outreach.gleampro.ca`.
- The Cloud project's OAuth consent screen is on "Internal" but the user you signed in with isn't in the Workspace org. Check **People & sharing → Account access** in the Cloud project.

### Tunnel works locally but `https://outreach.gleampro.ca` returns 1033 from Cloudflare
- DNS CNAME wasn't created. Run `cloudflared tunnel route dns gleampro-outreach outreach.gleampro.ca` again, or add the CNAME manually (see Stage 6e Option 1).

### Smoke email goes to spam
- DMARC is set to `p=reject` too early. Set it back to `p=none` for the first 30 days.
- DKIM not authenticated yet — re-check Stage 3c.
- Recipient's mail server doesn't trust new domains. This is normal; warm up by sending to gmail.com / outlook.com personal addresses first, then to business addresses, gradually over 2 weeks.

---

## What this setup gives you

| | |
|---|---|
| Sender | `outreach@outreach.gleampro.ca` |
| Reputation | Isolated subdomain, separate from main `gleampro.ca` |
| Cost | $7/mo (Business Starter, 1 seat) |
| Hosting | Local PC, exposed via Cloudflare Tunnel |
| OAuth | Internal consent (no public verification needed) |
| DNS auth | SPF + DKIM + DMARC, all on the subdomain |

Once Phase 1 is complete, the Phase 2 code can send compliant outreach email and process unsubscribes end-to-end. Phase 3 (campaign + sequence engine) is next.
