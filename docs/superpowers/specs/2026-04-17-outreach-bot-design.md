# GleamPro Outreach Bot — Design

**Date:** 2026-04-17
**Status:** Approved for implementation planning
**Author:** Brainstormed with Claude Opus 4.7

---

## 1. Goal & Success Criteria

Extend the existing GleamPro lead-generation pipeline into a compliance-first cold-email bot that produces **≥1 signed cleaning contract per month** by running small, focused campaigns against one business vertical at a time.

**Primary success metric:** 1 signed contract in month 2 (after warm-up completes).

**Secondary metrics:**
- Reply rate ≥ 5%
- Complaint rate < 0.1%
- Bounce rate < 2%
- Zero CASL complaints filed to CRTC

**Philosophy:** Quality over volume. Learn-while-doing. Protect company identity and main-domain reputation above all.

---

## 2. Non-Goals (Explicit Scope Exclusions for v1)

- Multi-domain / multi-mailbox rotation
- Third-party sending platforms (Instantly, Smartlead, SendGrid, etc.)
- Automated / AI-driven reply handling — replies route to the human operator
- CRM integration (sales pipeline stays in the bot's SQLite DB)
- Mobile app, SMS, LinkedIn, or any non-email outreach channel
- Sending volumes above ~20/day — if scale is ever needed, that's a future design cycle
- Public-facing marketing dashboard, analytics exports, or multi-user access

---

## 3. Constraints & Context

### Business
- **Registered legal name:** Gleam & Lift Solutions
- **Operating name:** GleamPro Cleaning
- **Mailing address:** Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8
- **Service area:** Metro Vancouver
- **Existing pipeline:** discovers ~4 top leads/week; generates 3 draft styles per lead (`curious_neighbor`, `value_lead`, `compliment_question`)
- **Strategic driver:** replace existing subcontractor work with direct-to-client cleaning contracts; 1 new contract/month is the initial growth target

### Legal (CASL — Canada's Anti-Spam Legislation)
- **Consent basis:** implied consent via conspicuous publication of business email addresses relevant to the recipient's role.
- **Record retention:** 3 years minimum for consent basis + send logs.
- **Private right of action is currently suspended** — enforcement is via CRTC on a complaints-driven basis. Penalty exposure: up to $10M per violation.
- **Hard requirements (CASL §6):** working unsubscribe mechanism processed within 10 business days; sender identification (legal name + physical address) in every message; accurate sender headers.

### Technical
- **Hosting:** local Windows PC, accessed via TeamViewer. No cloud servers in v1.
- **Runtime:** existing Next.js app + SQLite + node-cron. No stack changes.
- **Send window:** 9am–5pm America/Vancouver, Monday through Friday.
- **Warm-up ceiling:** 20 sends/day max after a 4-week ramp.

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Windows PC (always on 9am-5pm Mon-Fri)                     │
│                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────┐   │
│  │  Next.js     │   │  Scheduler   │   │ Pipeline CLI  │   │
│  │  dashboard   │◄──┤ (node-cron)  │◄──┤ (existing)    │   │
│  │  + API       │   │              │   │               │   │
│  └──────┬───────┘   └──────┬───────┘   └───────────────┘   │
│         │                  │                               │
│         ▼                  ▼                               │
│  ┌─────────────────────────────────────────────┐           │
│  │            SQLite (data/gaban.sqlite)       │           │
│  └─────────────────────────────────────────────┘           │
│         ▲                  ▲                               │
│         │                  │                               │
│  ┌──────┴────────┐  ┌──────┴───────┐                       │
│  │ Email sender  │  │ Gmail poller │                       │
│  │ (Gmail API)   │  │ (every 5min) │                       │
│  └───────┬───────┘  └──────┬───────┘                       │
└──────────┼─────────────────┼───────────────────────────────┘
           │                 │
           ▼                 ▲
    ┌─────────────────────────────┐
    │  Gmail                      │
    │  outreach@outreach.         │
    │  gleampro.ca                │
    │  (isolated Workspace user)  │
    └─────────────────────────────┘
           ▲
           │  /u/:token (public only)
    ┌──────┴──────────────┐
    │  Cloudflare Tunnel  │
    └─────────────────────┘
```

**Key properties:**
- Single local host, no third-party SaaS for sending.
- Reputation isolation: cold outreach runs on a dedicated Workspace user on a separate subdomain (`outreach.gleampro.ca`) with its own SPF/DKIM/DMARC. The main business mailbox is never touched by outreach traffic.
- Cloudflare Tunnel exposes **only** the `/u/:token` unsubscribe path publicly. Everything else remains LAN-local behind the existing login middleware.

---

## 5. Components

### 5.1 Google Workspace user (new)
- New seat: $7 CAD/month equivalent.
- Address: `outreach@outreach.gleampro.ca`.
- Subdomain `outreach.gleampro.ca` added to Workspace with its own SPF, DKIM, DMARC records.
- Purpose: full reputation isolation from the main business mailbox.

### 5.2 Gmail API client
- OAuth2 app registered in Google Cloud Console.
- Scopes: `gmail.send`, `gmail.readonly` (for reply + bounce detection).
- Refresh token stored in `.env` (`GMAIL_OAUTH_REFRESH_TOKEN`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`).
- Service module: `src/services/gmailService.js`.

### 5.3 Campaign model
- **One active campaign at a time.** A campaign = a business vertical + a preset (targeting rules) + a 3-touch template set + a status + a daily cap + a date range.
- Lifecycle: `draft` → `running` → `paused` | `completed`.

### 5.4 Sequence engine
- Per-`campaign_lead` state machine: `queued` → `sent_1` → `sent_2` → `sent_3` → `completed`, with terminal transitions to `replied`, `unsubscribed`, `bounced`, or `paused` available from any intermediate state.
- Touch spacing: Day 0 / Day 4 / Day 10. Follow-ups reply in the same Gmail thread as the initial.
- Touch → style mapping: touch 1 = `curious_neighbor`, touch 2 = `value_lead`, touch 3 = `compliment_question`. (Configurable per campaign.)

### 5.5 Reply poller
- Runs every 5 minutes during the send window.
- For each active `campaign_lead` with pending follow-ups, call `gmail.users.threads.get(threadId)`. If the thread contains any inbound message after the last outbound, mark `campaign_lead.status='replied'`, cancel pending sends, emit a desktop notification.
- Also scans for bounce DSN messages addressed to the sender.

### 5.6 Suppression list
- Single authoritative table. Every send checks it before dispatching.
- Entries come from: unsubscribe clicks, hard bounces, soft bounces after 3 attempts, manual `do-not-contact` flags, spam complaints (if detected via feedback-loop headers).
- Stored as a hash of the lowercased email plus the domain; domain-level wildcards supported ("block everything `@acme.com`").
- Entries are **never deleted** — only added.

### 5.7 Unsubscribe endpoint
- Route: `GET /u/:token` on the Next.js app, whitelisted in middleware to bypass authentication.
- Token: HMAC-signed payload of `email_sends.id`, verified with a secret stored in `.env`.
- On click: write to `suppression_list`, set `campaign_lead.status='unsubscribed'`, cancel all pending sends for that email, render a confirmation page with the business name and mailing address.

### 5.8 Outcome tracker
- Manual logging in the dashboard per `campaign_lead`.
- Stages: **Meeting Booked** → **Site Visit Completed** → **Contract Signed**.
- Fields: meeting date, site-visit notes, contract signed date, monthly contract value.

### 5.9 Dashboard additions
- Campaign list page (active + completed).
- Campaign detail page with per-touch metrics, active lead queue, funnel counters.
- Lead detail page showing the full sequence timeline, any replies, outcome-logging controls.
- **Heartbeat indicator** in the layout — green if the scheduler has processed a tick in the last 5 min, red otherwise.
- **Missed sends panel** — surfaces any send that backfill marked as "skipped because > 2 hours stale."

### 5.10 Operational resilience layer
- Windows Task Scheduler entry launches the Next.js server + scheduler on boot.
- Backfill job on startup: scans `email_sends` for `status='scheduled'` AND `scheduled_for < now`; sends anything within a 2-hour grace window, logs anything older as `missed`.
- Nightly SQLite backup to a configured cloud folder (Google Drive / OneDrive / Dropbox).
- 9am weekday desktop notification summarizing the day's scheduled sends.
- Documentation for configuring Windows power plan (no sleep 9-5 Mon-Fri) and Windows Update active hours (8am–7pm Mon-Fri).

---

## 6. Data Model

New tables only. Existing tables (`leads`, `outreach_drafts`, `presets`, `pipeline_runs`, `schedules`, `lead_notes`) are untouched.

```sql
CREATE TABLE campaigns (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  preset_id          INTEGER NOT NULL REFERENCES presets(id),
  status             TEXT NOT NULL DEFAULT 'draft',
  daily_cap          INTEGER NOT NULL DEFAULT 10,
  start_date         TEXT,
  end_date           TEXT,
  timezone           TEXT NOT NULL DEFAULT 'America/Vancouver',
  send_window_start  TEXT NOT NULL DEFAULT '09:00',
  send_window_end    TEXT NOT NULL DEFAULT '17:00',
  send_days          TEXT NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
  touch_styles       TEXT NOT NULL DEFAULT '["curious_neighbor","value_lead","compliment_question"]',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE campaign_leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id    INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id        INTEGER NOT NULL REFERENCES leads(id),
  status         TEXT NOT NULL DEFAULT 'queued',
  touch_count    INTEGER NOT NULL DEFAULT 0,
  added_at       TEXT NOT NULL,
  last_touch_at  TEXT,
  completed_at   TEXT,
  outcome        TEXT,
  UNIQUE(campaign_id, lead_id)
);

CREATE TABLE email_sends (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id   INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  touch_number       INTEGER NOT NULL,
  template_style     TEXT NOT NULL,
  subject            TEXT NOT NULL,
  body               TEXT NOT NULL,
  recipient_email    TEXT NOT NULL,
  gmail_message_id   TEXT,
  gmail_thread_id    TEXT,
  scheduled_for      TEXT NOT NULL,
  sent_at            TEXT,
  status             TEXT NOT NULL DEFAULT 'scheduled',
  error_message      TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE email_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id      INTEGER NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  detected_at  TEXT NOT NULL,
  raw_payload  TEXT
);

CREATE TABLE suppression_list (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash  TEXT UNIQUE,
  domain      TEXT,
  reason      TEXT NOT NULL,
  source      TEXT NOT NULL,
  added_at    TEXT NOT NULL
);

CREATE TABLE meetings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  scheduled_for     TEXT NOT NULL,
  kind              TEXT NOT NULL,  -- 'intro_call' | 'site_visit'
  notes             TEXT,
  completed         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE contracts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  signed_date       TEXT NOT NULL,
  value_monthly     REAL,
  notes             TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

**Status vocabularies:**
- `campaigns.status`: `draft` | `running` | `paused` | `completed`
- `campaign_leads.status`: `queued` | `sent_1` | `sent_2` | `sent_3` | `completed` | `replied` | `unsubscribed` | `bounced` | `paused`
- `email_sends.status`: `scheduled` | `sending` | `sent` | `failed` | `cancelled` | `missed`
- `email_events.type`: `delivered` | `opened` | `replied` | `bounced` | `unsubscribed` | `complained`

---

## 7. Key Flows

### 7.1 Discovery → campaign intake
1. Existing pipeline runs (weekly or on-demand) and writes to `leads` + `outreach_drafts`.
2. If there is an active campaign and its `daily_cap` has open slots for the day, select up to N new leads matching the campaign's preset and not already in the campaign.
3. For each selected lead, insert a `campaign_leads` row and an `email_sends` row for touch 1 with `scheduled_for` = the next valid slot in the send window.
4. Skip any lead whose email is already in the `suppression_list`.

### 7.2 Send tick (every 5 min during send window)
1. Load all `email_sends` rows where `status='scheduled'` AND `scheduled_for <= now`.
2. For each, verify the recipient email is not in `suppression_list` (last-chance check).
3. Verify the day's send count is below the warm-up cap AND below the campaign's `daily_cap`.
4. Call Gmail API `users.messages.send`, threading follow-ups via `In-Reply-To` headers.
5. On success: record `gmail_message_id`, `gmail_thread_id`, `sent_at`, `status='sent'`; increment `campaign_leads.touch_count`; schedule the next touch (+4 days or +10 days) if touch < 3.
6. On failure: record `status='failed'`, `error_message`, emit desktop notification.

### 7.3 Reply detection (poller tick, every 5 min)
1. For each `campaign_leads` row where `status IN ('sent_1','sent_2','sent_3')` AND there is a known `gmail_thread_id`, fetch the thread.
2. If any message in the thread was received **after** the last outbound `sent_at` AND is not a bounce DSN, mark `campaign_leads.status='replied'`.
3. Cancel all pending `email_sends` for that `campaign_lead` (set `status='cancelled'`).
4. Insert an `email_events` row with `type='replied'`.
5. Emit desktop notification: *"[Business Name] replied to touch [N]."*

### 7.4 Unsubscribe
1. Recipient clicks `https://outreach.gleampro.ca/u/<token>`.
2. Verify HMAC signature on the token to extract `email_sends.id`.
3. Look up the recipient email from the send record.
4. Insert `suppression_list` row with `reason='unsubscribed'`, `source='click'`.
5. Mark `campaign_leads.status='unsubscribed'`, cancel all pending sends to that email.
6. Render confirmation page: *"You've been unsubscribed. GleamPro Cleaning will no longer contact this address."*

### 7.5 Bounce handling
1. Reply poller detects DSN (`mailer-daemon@` or `Content-Type: multipart/report`).
2. Parse the original recipient.
3. If hard bounce (permanent failure codes 5.x.x): add to `suppression_list`, mark `campaign_leads.status='bounced'`, cancel pending sends.
4. If soft bounce (4.x.x): log to `email_events`, retry up to 3 times over 48 hours, then treat as hard.

### 7.6 Outcome logging (manual)
Dashboard's `campaign_leads` detail page exposes controls:
- *Book meeting* → inserts `meetings` row.
- *Complete site visit* → updates or inserts `meetings` row with `kind='site_visit', completed=1`.
- *Sign contract* → inserts `contracts` row with monthly value; sets `campaign_leads.status='completed'`, `outcome='won'`.
- *Mark lost* → sets `campaign_leads.status='completed'`, `outcome='lost'` with an optional reason.

### 7.7 Backfill on startup
1. Next.js instrumentation hook loads schedules (already exists).
2. New backfill routine scans `email_sends` where `status='scheduled'` AND `scheduled_for < now`.
3. For each, if `scheduled_for > now - 2 hours`: send immediately on next tick.
4. For each where `scheduled_for <= now - 2 hours`: mark `status='missed'` and surface in the dashboard's "missed sends" panel for human review.

---

## 8. CASL Compliance Requirements

Every outbound email includes a non-bypassable footer:

```
—
Gleam & Lift Solutions (operating as GleamPro Cleaning)
Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8

You're receiving this because your contact information is publicly published
on your business website. If you'd prefer not to hear from us, unsubscribe
here: https://outreach.gleampro.ca/u/<token>
```

**Scraper exclusion rule (added to `src/services/filteringService.js` or equivalent):** reject any lead whose source website contains a regex match for CASL-style opt-out notices:
- `no unsolicited (commercial )?email`
- `no spam`
- `do not email`
- `no cold (email|contact|outreach)`

**Record retention:** `email_sends`, `email_events`, `leads.source_url`, and `leads.created_at` are retained for a minimum of 3 years. Do not implement auto-delete for these tables.

**Unsubscribe SLA:** tokens are processed synchronously on click. The 10-business-day CASL window is never in play.

---

## 9. Warm-Up Schedule

The scheduler enforces a hard ceiling on daily sends based on a warm-up counter stored in `system_settings`:

| Week | Max sends/day | Notes |
|------|---------------|-------|
| 1    | 5             | Internal + friendly test inboxes only; validate SPF/DKIM/DMARC, unsubscribe flow, logging end-to-end. |
| 2    | 10            | First real campaign; small, hand-curated target list. |
| 3    | 15            | Monitor Google Postmaster Tools daily for domain + IP reputation. |
| 4+   | 20            | Steady-state ceiling. Do not exceed without an explicit review + decision. |

`system_settings.warm_up_week_start` is the anchor date; the scheduler computes the current week's cap from that plus `new Date()`. A campaign's `daily_cap` cannot exceed the current week's warm-up ceiling.

---

## 10. Operational Resilience

### 10.1 PC-off scenarios

| Scenario | Handling |
|----------|----------|
| Shutdown outside send window | No action needed; send window is 9-5 Mon-Fri. |
| Sleep during send window | Power plan configured to prevent sleep 9-5 Mon-Fri. Backfill catches anything missed on wake. |
| Windows Update reboot | Active hours set 8am-7pm Mon-Fri; reboots happen outside send window. If one sneaks through, Task Scheduler relaunches the app on boot and backfill handles the queue. |
| Power outage / crash | SQLite WAL mode already enabled (`db.js:97`). On recovery: Task Scheduler auto-starts, backfill runs. |
| Missed morning (forgot to turn PC on) | 9am desktop notification reminds the operator. Backfill handles up to 2-hour gap; anything older is logged as missed for manual review. |

### 10.2 Data protection
- **Nightly SQLite backup** via a small script that copies `data/gaban.sqlite` (plus `-wal` and `-shm` if present) to a cloud-synced folder.
- Keep last 7 nightly backups; prune older.
- Restore procedure documented in README.

### 10.3 Observability
- Dashboard heartbeat indicator (green/red) in the top nav.
- Missed sends panel.
- Per-campaign metrics: sent count, reply rate, bounce rate, unsubscribe rate.
- Funnel view per campaign: leads queued → touched → replied → meeting → contract.

---

## 11. Phased Build Sequence

1. **Week 1 — Foundation (infra, no code)**
   Create Workspace user + subdomain + DNS (SPF/DKIM/DMARC). Register Google Cloud project + OAuth client. Obtain refresh token. Set up Cloudflare Tunnel pointing `outreach.gleampro.ca` to local Next.js. Verify tunnel works with a dummy public route.

2. **Week 2 — Core infrastructure (code)**
   New DB migrations for all tables in §6. `suppressionService.js`, `unsubscribeTokenService.js`. Public `/u/:token` route with middleware whitelist. Gmail sender service (send-only) with CASL footer template. Unit tests for token signing/verification + suppression checks.

3. **Week 3 — Campaign + sequence engine**
   `campaignService.js`, `sequenceService.js`. Scheduler integration for send ticks (5-min cron). 3-touch scheduling logic including same-thread follow-ups. Daily-cap enforcement with warm-up ceiling. Backfill job on startup.

4. **Week 4 — Inbound + reply handling**
   `gmailPoller.js` (5-min tick during send window). Reply detection, bounce detection (DSN parsing), auto-cancel of pending sends on reply/unsubscribe/bounce. Desktop notification integration (Windows-native).

5. **Week 5 — Dashboard**
   Campaign list + detail pages. Sequence timeline per campaign lead. Outcome logging forms (meeting, site visit, contract). Heartbeat indicator in layout. Missed sends panel.

6. **Week 6 — Operational resilience + first campaign**
   Windows Task Scheduler entry. Nightly backup script. Power plan + Windows Update active-hours documentation. Launch Week 1 warm-up campaign (5 sends/day to internal/friendly inboxes).

7. **Week 7+ — First real campaign** (post-build)
   Pick one vertical (e.g., dental offices), run for 3-4 weeks, observe metrics, iterate.

---

## 12. Testing Strategy

**Unit tests:**
- Sequence state-machine transitions.
- Suppression list check (exact email + domain wildcard).
- Unsubscribe token generation and HMAC verification.
- CASL footer injection into email body.
- Warm-up cap calculation.
- DSN parsing (sample bounce messages).

**Integration tests:**
- End-to-end send flow against a Gmail test account — actually sends, then retrieves the message, verifies headers and footer.
- Reply detection — seed a reply into the test thread, confirm sequence auto-pauses.
- Unsubscribe flow — click the token URL, confirm DB state changes and confirmation page renders.

**Manual acceptance tests:**
- Reboot test: kill the PC during a send window, confirm app + scheduler come back and backfill works.
- Sleep/wake test: sleep the PC for 15 minutes during send window, confirm backfill handles queued sends.
- Tunnel disconnect test: stop Cloudflare Tunnel, confirm app continues running locally; restart tunnel, confirm `/u/:token` is reachable again.
- Nightly backup test: verify backup file appears in cloud folder the next morning.

**Existing test suite:** `tests/db.test.js`, `tests/sqliteService.test.js`, `tests/sqlitePipeline.test.js` must continue to pass.

---

## 13. Open Questions for Implementation Planning

These are expected to be resolved during the implementation-plan phase, not here:

1. Exact Windows desktop notification library (node-notifier vs. native PowerShell).
2. HMAC secret rotation policy (likely: generate once, store in `.env`, rotate only on compromise).
3. Whether to add a Postmaster Tools scraper for automated reputation monitoring, or rely on manual weekly checks.
4. Dashboard visual design — extend existing shadcn/tailwind patterns already in `src/web/components/`.

---

## 14. Decision Log (Rejected Alternatives)

| Decision | Chose | Rejected | Reason |
|----------|-------|----------|--------|
| Hosting | Local PC + Cloudflare Tunnel | Vercel / Railway | Zero cost; user has TeamViewer access; no code rewrites. |
| Email provider | Google Workspace user on subdomain (new $7/mo seat) | Alias on existing user; Smartlead/Instantly; SendGrid | Full reputation isolation at low cost; no third-party SaaS dependency; SendGrid terminates cold-email accounts. |
| Sequence | 3 touches (Day 0/4/10) | 1 touch, 2 touches, 4+ touches | Best reply-rate-per-lead at low volume; matches existing 3-style draft generation. |
| Campaign concurrency | One active at a time | 2-4 concurrent | Clearer learning signal per vertical; matches "quality over volume" philosophy. |
| Reply detection | Gmail API polling (5-min) | Pub/Sub push; IMAP IDLE | Simpler, no Google Cloud Pub/Sub setup, adequate latency at this scale. |
| Volume target | ≤20/day steady state | 500-800/day original ask | Goal is 1 contract/month, which math supports with 10-40 well-targeted sends/week; 500+/day would add massive compliance + deliverability risk for no business benefit at current scale. |
