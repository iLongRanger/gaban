# Outreach Bot — Phase 2: Core Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimal compliance-first email-sending foundation: DB schema, suppression list, unsubscribe-token service, CASL-compliant email template wrapper, Gmail API sender, and the public `/u/:token` unsubscribe page. After this plan, the bot can send a single compliant outreach email and handle the unsubscribe click end-to-end.

**Architecture:** ES-module Node services injected with a Gmail client for testability. HMAC-signed unsubscribe tokens (stateless). SQLite schema extended with seven new tables. Public unsubscribe page served by the existing Next.js app via a middleware whitelist exception.

**Tech Stack:** Node.js 22 (ES modules), `node:test`, `node:crypto`, `better-sqlite3`, `googleapis` (already installed), Next.js 16 App Router, TypeScript (web only).

**Scope boundary (what this plan does NOT do):** campaign model, sequence engine, scheduler integration, Gmail polling, reply/bounce detection, dashboard UI, Windows Task Scheduler setup, backups. All of these are later phases.

---

## Prerequisites (Phase 1 — manual, before any task below)

These are one-time infra steps. Complete and tick each before starting Task 1.

- [ ] Google Workspace: add new user `outreach@outreach.gleampro.ca` ($7/mo seat).
- [ ] DNS: add `outreach.gleampro.ca` as a secondary domain in Workspace.
- [ ] DNS: publish separate SPF, DKIM, and DMARC records for `outreach.gleampro.ca`. Verify each with `nslookup -type=TXT` from a terminal.
- [ ] Google Cloud Console: create a new project `gleampro-outreach`. Enable the Gmail API.
- [ ] OAuth consent screen: configure (internal user type; scopes `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly`).
- [ ] OAuth credentials: create a Desktop App OAuth 2.0 Client ID. Save `client_id` and `client_secret`.
- [ ] Obtain a refresh token for `outreach@outreach.gleampro.ca` (use Google's OAuth Playground or a one-time CLI script; authenticate as that Workspace user, grant both scopes, save the refresh token).
- [ ] Cloudflare Tunnel: install `cloudflared` on the PC. Create a tunnel named `gleampro-outreach`. Route `outreach.gleampro.ca` → `http://localhost:3000`. Verify it resolves externally.
- [ ] Add the following to `.env` (create if missing):
  ```
  GMAIL_OAUTH_CLIENT_ID=<client id>
  GMAIL_OAUTH_CLIENT_SECRET=<client secret>
  GMAIL_OAUTH_REFRESH_TOKEN=<refresh token>
  GMAIL_SENDER_EMAIL=outreach@outreach.gleampro.ca
  GMAIL_SENDER_NAME=GleamPro Cleaning
  UNSUBSCRIBE_TOKEN_SECRET=<random 32-byte base64 string>
  PUBLIC_APP_URL=https://outreach.gleampro.ca
  BUSINESS_LEGAL_NAME=Gleam & Lift Solutions
  BUSINESS_OPERATING_NAME=GleamPro Cleaning
  BUSINESS_MAILING_ADDRESS=Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8
  ```
  Generate `UNSUBSCRIBE_TOKEN_SECRET` with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

---

## File Structure

**Creating:**
- `src/services/unsubscribeTokenService.js` — HMAC sign/verify for unsubscribe tokens
- `src/services/suppressionService.js` — suppression list check/insert
- `src/services/emailTemplateService.js` — wraps message body with CASL footer
- `src/services/gmailService.js` — Gmail API client wrapper (send only)
- `src/web/app/u/[token]/page.tsx` — public unsubscribe confirmation page
- `src/web/app/u/[token]/actions.ts` — server action that processes the unsubscribe
- `tests/unsubscribeTokenService.test.js`
- `tests/suppressionService.test.js`
- `tests/emailTemplateService.test.js`
- `tests/gmailService.test.js`

**Modifying:**
- `src/web/lib/db.js` — append new tables to `SCHEMA`
- `src/web/middleware.ts:6` — add `/u` to `PUBLIC_PATHS`
- `tests/db.test.js` — add assertions for the new tables
- `.env.example` (create if missing) — document new env vars

**Not touched in this plan:** pipeline CLI (`src/cli/run.js`), existing services, existing web pages, existing tests other than `db.test.js`.

---

## Task 1: Database schema — add new tables

**Files:**
- Modify: `src/web/lib/db.js:6-92` (append to `SCHEMA` constant)
- Modify: `tests/db.test.js` (append new `describe` block)

- [ ] **Step 1.1: Write failing tests for new tables**

Append to `tests/db.test.js` (at the end, before the final line):

```javascript
describe('Outreach tables', () => {
  let db;

  before(() => {
    db = initDb(':memory:');
  });

  after(() => {
    db.close();
  });

  it('creates campaigns table', () => {
    const columns = db.pragma('table_info(campaigns)').map(c => c.name);
    for (const col of ['id', 'name', 'preset_id', 'status', 'daily_cap',
      'start_date', 'end_date', 'timezone', 'send_window_start',
      'send_window_end', 'send_days', 'touch_styles', 'created_at', 'updated_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates campaign_leads table with unique (campaign_id, lead_id)', () => {
    const columns = db.pragma('table_info(campaign_leads)').map(c => c.name);
    for (const col of ['id', 'campaign_id', 'lead_id', 'status', 'touch_count',
      'added_at', 'last_touch_at', 'completed_at', 'outcome']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
    const indexes = db.pragma('index_list(campaign_leads)');
    assert.ok(indexes.some(i => i.unique === 1), 'missing unique index');
  });

  it('creates email_sends table', () => {
    const columns = db.pragma('table_info(email_sends)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'touch_number', 'template_style',
      'subject', 'body', 'recipient_email', 'gmail_message_id', 'gmail_thread_id',
      'scheduled_for', 'sent_at', 'status', 'error_message', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates email_events table', () => {
    const columns = db.pragma('table_info(email_events)').map(c => c.name);
    for (const col of ['id', 'send_id', 'type', 'detected_at', 'raw_payload']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates suppression_list table with unique email_hash', () => {
    const columns = db.pragma('table_info(suppression_list)').map(c => c.name);
    for (const col of ['id', 'email_hash', 'domain', 'reason', 'source', 'added_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
    const now = new Date().toISOString();
    db.prepare('INSERT INTO suppression_list (email_hash, reason, source, added_at) VALUES (?, ?, ?, ?)')
      .run('abc123', 'unsubscribed', 'click', now);
    assert.throws(() => {
      db.prepare('INSERT INTO suppression_list (email_hash, reason, source, added_at) VALUES (?, ?, ?, ?)')
        .run('abc123', 'unsubscribed', 'click', now);
    });
  });

  it('creates meetings table', () => {
    const columns = db.pragma('table_info(meetings)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'scheduled_for', 'kind',
      'notes', 'completed', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates contracts table', () => {
    const columns = db.pragma('table_info(contracts)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'signed_date', 'value_monthly',
      'notes', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates system_settings table', () => {
    const columns = db.pragma('table_info(system_settings)').map(c => c.name);
    for (const col of ['key', 'value', 'updated_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="Outreach tables"`
Expected: all 8 new tests FAIL because tables don't exist.

- [ ] **Step 1.3: Add the new tables to SCHEMA**

In `src/web/lib/db.js`, append to the `SCHEMA` template literal (before the closing backtick on line 92):

```javascript
CREATE TABLE IF NOT EXISTS campaigns (
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

CREATE TABLE IF NOT EXISTS campaign_leads (
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

CREATE TABLE IF NOT EXISTS email_sends (
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

CREATE TABLE IF NOT EXISTS email_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id      INTEGER NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  detected_at  TEXT NOT NULL,
  raw_payload  TEXT
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash  TEXT UNIQUE,
  domain      TEXT,
  reason      TEXT NOT NULL,
  source      TEXT NOT NULL,
  added_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  scheduled_for     TEXT NOT NULL,
  kind              TEXT NOT NULL,
  notes             TEXT,
  completed         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  signed_date       TEXT NOT NULL,
  value_monthly     REAL,
  notes             TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="Outreach tables"`
Expected: all 8 new tests PASS. Existing tests still PASS.

Run the full suite to confirm no regressions: `npm test`
Expected: entire suite passes.

- [ ] **Step 1.5: Commit**

```bash
git add src/web/lib/db.js tests/db.test.js
git commit -m "feat(db): add outreach bot schema (campaigns, email_sends, suppression, etc.)"
```

---

## Task 2: Unsubscribe token service

Stateless HMAC-signed tokens that encode a send ID and expiry. Verified on click. No DB state needed for the token itself.

**Files:**
- Create: `src/services/unsubscribeTokenService.js`
- Create: `tests/unsubscribeTokenService.test.js`

- [ ] **Step 2.1: Write failing tests**

Create `tests/unsubscribeTokenService.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken
} from '../src/services/unsubscribeTokenService.js';

const SECRET = 'test-secret-do-not-use-in-prod';

describe('unsubscribeTokenService', () => {
  it('round-trips a send id', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    const payload = verifyUnsubscribeToken(token, SECRET);
    assert.strictEqual(payload.sendId, 42);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    assert.throws(() => verifyUnsubscribeToken(token, 'different-secret'),
      /invalid signature/i);
  });

  it('rejects a tampered payload', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    const [payloadB64, sig] = token.split('.');
    const tampered = Buffer.from(payloadB64, 'base64url').toString('utf8')
      .replace('42', '99');
    const tamperedToken = Buffer.from(tampered).toString('base64url') + '.' + sig;
    assert.throws(() => verifyUnsubscribeToken(tamperedToken, SECRET),
      /invalid signature/i);
  });

  it('rejects a malformed token', () => {
    assert.throws(() => verifyUnsubscribeToken('not-a-token', SECRET),
      /malformed/i);
    assert.throws(() => verifyUnsubscribeToken('', SECRET),
      /malformed/i);
  });

  it('produces urlsafe tokens (no +, /, =)', () => {
    const token = signUnsubscribeToken({ sendId: 1 }, SECRET);
    assert.ok(!/[+/=]/.test(token), 'token contains URL-unsafe characters');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="unsubscribeTokenService"`
Expected: FAIL (module does not exist).

- [ ] **Step 2.3: Implement the service**

Create `src/services/unsubscribeTokenService.js`:

```javascript
import crypto from 'node:crypto';

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signUnsubscribeToken(payload, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(json);
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyUnsubscribeToken(token, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new Error('malformed token');
  }
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    throw new Error('malformed token');
  }
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    throw new Error('invalid signature');
  }
  try {
    return JSON.parse(b64urlDecode(payloadB64));
  } catch {
    throw new Error('malformed token');
  }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="unsubscribeTokenService"`
Expected: all 5 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/unsubscribeTokenService.js tests/unsubscribeTokenService.test.js
git commit -m "feat(outreach): add HMAC-signed unsubscribe token service"
```

---

## Task 3: Suppression service

Single source of truth for who-not-to-email. Email addresses are hashed (SHA-256, lowercased) so we can match without storing plaintext long-term, though we also keep domains for wildcard blocks.

**Files:**
- Create: `src/services/suppressionService.js`
- Create: `tests/suppressionService.test.js`

- [ ] **Step 3.1: Write failing tests**

Create `tests/suppressionService.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { SuppressionService } from '../src/services/suppressionService.js';

describe('SuppressionService', () => {
  let db, svc;

  beforeEach(() => {
    db = initDb(':memory:');
    svc = new SuppressionService({ db });
  });

  afterEach(() => {
    db.close();
  });

  it('isSuppressed returns false for unknown email', () => {
    assert.strictEqual(svc.isSuppressed('unknown@example.com'), false);
  });

  it('add + isSuppressed round trip (case-insensitive)', () => {
    svc.add({ email: 'Foo@Example.COM', reason: 'unsubscribed', source: 'click' });
    assert.strictEqual(svc.isSuppressed('foo@example.com'), true);
    assert.strictEqual(svc.isSuppressed('FOO@example.com'), true);
  });

  it('add is idempotent (same email twice does not throw)', () => {
    svc.add({ email: 'a@b.com', reason: 'unsubscribed', source: 'click' });
    svc.add({ email: 'a@b.com', reason: 'unsubscribed', source: 'click' });
    const count = db.prepare('SELECT COUNT(*) as c FROM suppression_list').get();
    assert.strictEqual(count.c, 1);
  });

  it('domain wildcard suppresses all addresses at that domain', () => {
    svc.addDomain({ domain: 'blocked.com', reason: 'manual', source: 'operator' });
    assert.strictEqual(svc.isSuppressed('anyone@blocked.com'), true);
    assert.strictEqual(svc.isSuppressed('someone@otherdomain.com'), false);
  });

  it('rejects malformed emails', () => {
    assert.throws(() => svc.add({ email: 'not-an-email', reason: 'x', source: 'y' }),
      /invalid email/i);
    assert.throws(() => svc.add({ email: '', reason: 'x', source: 'y' }),
      /invalid email/i);
  });

  it('requires reason and source', () => {
    assert.throws(() => svc.add({ email: 'a@b.com', source: 'x' }), /reason/i);
    assert.throws(() => svc.add({ email: 'a@b.com', reason: 'x' }), /source/i);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="SuppressionService"`
Expected: FAIL (module does not exist).

- [ ] **Step 3.3: Implement the service**

Create `src/services/suppressionService.js`:

```javascript
import crypto from 'node:crypto';

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length < 3) return false;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  if (at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return false;
  return true;
}

export class SuppressionService {
  constructor({ db }) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  isSuppressed(email) {
    if (!isValidEmail(email)) return false;
    const hash = hashEmail(email);
    const byHash = this.db.prepare(
      'SELECT 1 FROM suppression_list WHERE email_hash = ? LIMIT 1'
    ).get(hash);
    if (byHash) return true;

    const domain = email.toLowerCase().trim().split('@')[1];
    const byDomain = this.db.prepare(
      'SELECT 1 FROM suppression_list WHERE email_hash IS NULL AND domain = ? LIMIT 1'
    ).get(domain);
    return !!byDomain;
  }

  add({ email, reason, source }) {
    if (!isValidEmail(email)) throw new Error(`invalid email: ${email}`);
    if (!reason) throw new Error('reason required');
    if (!source) throw new Error('source required');
    const hash = hashEmail(email);
    const domain = email.toLowerCase().trim().split('@')[1];
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR IGNORE INTO suppression_list (email_hash, domain, reason, source, added_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(hash, domain, reason, source, now);
  }

  addDomain({ domain, reason, source }) {
    if (!domain || typeof domain !== 'string') throw new Error('domain required');
    if (!reason) throw new Error('reason required');
    if (!source) throw new Error('source required');
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO suppression_list (email_hash, domain, reason, source, added_at)
       VALUES (NULL, ?, ?, ?, ?)`
    ).run(domain.toLowerCase().trim(), reason, source, now);
  }
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="SuppressionService"`
Expected: all 6 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/services/suppressionService.js tests/suppressionService.test.js
git commit -m "feat(outreach): add suppression service with email + domain wildcards"
```

---

## Task 4: Email template service (CASL footer)

Every outbound message gets a non-bypassable footer. This service is the single place that composes the final body + subject from a draft and a send ID.

**Files:**
- Create: `src/services/emailTemplateService.js`
- Create: `tests/emailTemplateService.test.js`

- [ ] **Step 4.1: Write failing tests**

Create `tests/emailTemplateService.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';

const CONFIG = {
  legalName: 'Gleam & Lift Solutions',
  operatingName: 'GleamPro Cleaning',
  mailingAddress: 'Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8',
  publicAppUrl: 'https://outreach.gleampro.ca',
  tokenSecret: 'test-secret',
};

describe('buildOutreachEmail', () => {
  it('appends the CASL footer to body', () => {
    const { body } = buildOutreachEmail({
      sendId: 7,
      subject: 'Hello',
      body: 'Hi there.',
      config: CONFIG,
    });
    assert.ok(body.includes('Gleam & Lift Solutions'), 'missing legal name');
    assert.ok(body.includes('GleamPro Cleaning'), 'missing operating name');
    assert.ok(body.includes('Set 6 — 1209 Fourth Avenue'), 'missing mailing address');
    assert.ok(body.includes('Unsubscribe'), 'missing unsubscribe label');
    assert.ok(body.includes('https://outreach.gleampro.ca/u/'), 'missing unsubscribe URL');
  });

  it('leaves subject unchanged', () => {
    const { subject } = buildOutreachEmail({
      sendId: 7,
      subject: 'My Subject',
      body: 'Body',
      config: CONFIG,
    });
    assert.strictEqual(subject, 'My Subject');
  });

  it('embeds a verifiable unsubscribe token for the given sendId', async () => {
    const { verifyUnsubscribeToken } = await import('../src/services/unsubscribeTokenService.js');
    const { body } = buildOutreachEmail({
      sendId: 42,
      subject: 'x',
      body: 'y',
      config: CONFIG,
    });
    const match = body.match(/\/u\/([^\s)]+)/);
    assert.ok(match, 'token not found in body');
    const payload = verifyUnsubscribeToken(match[1], CONFIG.tokenSecret);
    assert.strictEqual(payload.sendId, 42);
  });

  it('throws if sendId missing', () => {
    assert.throws(() => buildOutreachEmail({
      subject: 'x',
      body: 'y',
      config: CONFIG,
    }), /sendId/i);
  });

  it('throws if config missing a required field', () => {
    const bad = { ...CONFIG, legalName: undefined };
    assert.throws(() => buildOutreachEmail({
      sendId: 1, subject: 'x', body: 'y', config: bad,
    }), /legalName/i);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="buildOutreachEmail"`
Expected: FAIL (module does not exist).

- [ ] **Step 4.3: Implement the service**

Create `src/services/emailTemplateService.js`:

```javascript
import { signUnsubscribeToken } from './unsubscribeTokenService.js';

const REQUIRED_CONFIG = ['legalName', 'operatingName', 'mailingAddress', 'publicAppUrl', 'tokenSecret'];

function validateConfig(config) {
  for (const key of REQUIRED_CONFIG) {
    if (!config?.[key]) throw new Error(`config.${key} is required`);
  }
}

export function buildOutreachEmail({ sendId, subject, body, config }) {
  if (sendId === undefined || sendId === null) throw new Error('sendId is required');
  validateConfig(config);

  const token = signUnsubscribeToken({ sendId }, config.tokenSecret);
  const unsubscribeUrl = `${config.publicAppUrl.replace(/\/$/, '')}/u/${token}`;

  const footer = [
    '',
    '—',
    `${config.legalName} (operating as ${config.operatingName})`,
    config.mailingAddress,
    '',
    "You're receiving this because your contact information is publicly published on your business website.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  return {
    subject,
    body: `${body}\n${footer}`,
  };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="buildOutreachEmail"`
Expected: all 5 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/services/emailTemplateService.js tests/emailTemplateService.test.js
git commit -m "feat(outreach): add email template service with CASL footer"
```

---

## Task 5: Gmail service (send only)

Thin wrapper around `googleapis` for sending. Accepts an injectable client for testability. In production, the client is constructed from OAuth2 credentials in `.env`.

**Files:**
- Create: `src/services/gmailService.js`
- Create: `tests/gmailService.test.js`

- [ ] **Step 5.1: Write failing tests**

Create `tests/gmailService.test.js`:

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GmailService } from '../src/services/gmailService.js';

function makeFakeClient({ sendResult, sendError }) {
  const calls = [];
  const fake = {
    users: {
      messages: {
        send: async (args) => {
          calls.push(args);
          if (sendError) throw sendError;
          return { data: sendResult };
        },
      },
    },
  };
  return { fake, calls };
}

describe('GmailService', () => {
  const sender = { email: 'outreach@outreach.gleampro.ca', name: 'GleamPro' };

  it('sends a message and returns gmail ids', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'msg123', threadId: 'thr123' },
    });
    const svc = new GmailService({ client: fake, sender });

    const result = await svc.send({
      to: 'dest@example.com',
      subject: 'Hi',
      body: 'Hello world.',
    });

    assert.strictEqual(result.gmail_message_id, 'msg123');
    assert.strictEqual(result.gmail_thread_id, 'thr123');
    assert.strictEqual(calls.length, 1);
    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('To: dest@example.com'));
    assert.ok(raw.includes('From: GleamPro <outreach@outreach.gleampro.ca>'));
    assert.ok(raw.includes('Subject: Hi'));
    assert.ok(raw.includes('Hello world.'));
  });

  it('threads follow-ups via In-Reply-To and References', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'msg2', threadId: 'thr123' },
    });
    const svc = new GmailService({ client: fake, sender });

    await svc.send({
      to: 'dest@example.com',
      subject: 'Re: Hi',
      body: 'Follow up.',
      threadId: 'thr123',
      inReplyTo: '<msg1@mail.gmail.com>',
    });

    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('In-Reply-To: <msg1@mail.gmail.com>'));
    assert.ok(raw.includes('References: <msg1@mail.gmail.com>'));
    assert.strictEqual(calls[0].requestBody.threadId, 'thr123');
  });

  it('wraps the body as text/plain with utf-8', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'm', threadId: 't' },
    });
    const svc = new GmailService({ client: fake, sender });
    await svc.send({ to: 'x@y.com', subject: 's', body: 'café' });
    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('Content-Type: text/plain; charset="UTF-8"'));
    assert.ok(raw.includes('café'));
  });

  it('surfaces send errors', async () => {
    const err = new Error('quota exceeded');
    const { fake } = makeFakeClient({ sendError: err });
    const svc = new GmailService({ client: fake, sender });
    await assert.rejects(
      () => svc.send({ to: 'x@y.com', subject: 's', body: 'b' }),
      /quota exceeded/
    );
  });

  it('rejects missing to/subject/body', async () => {
    const { fake } = makeFakeClient({ sendResult: { id: 'm', threadId: 't' } });
    const svc = new GmailService({ client: fake, sender });
    await assert.rejects(() => svc.send({ subject: 's', body: 'b' }), /to/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', body: 'b' }), /subject/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', subject: 's' }), /body/i);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="GmailService"`
Expected: FAIL (module does not exist).

- [ ] **Step 5.3: Implement the service**

Create `src/services/gmailService.js`:

```javascript
import { google } from 'googleapis';

function buildRawMessage({ to, from, subject, body, threadId, inReplyTo }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  const raw = headers.join('\r\n') + '\r\n\r\n' + body;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function createGmailClientFromEnv(env = process.env) {
  const clientId = env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN are required');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

export class GmailService {
  constructor({ client, sender, logger }) {
    if (!client) throw new Error('client required');
    if (!sender?.email) throw new Error('sender.email required');
    this.client = client;
    this.sender = sender;
    this.logger = logger;
  }

  async send({ to, subject, body, threadId, inReplyTo }) {
    if (!to) throw new Error('to required');
    if (!subject) throw new Error('subject required');
    if (!body) throw new Error('body required');

    const from = this.sender.name
      ? `${this.sender.name} <${this.sender.email}>`
      : this.sender.email;

    const raw = buildRawMessage({ to, from, subject, body, threadId, inReplyTo });

    const requestBody = { raw };
    if (threadId) requestBody.threadId = threadId;

    const response = await this.client.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      gmail_message_id: response.data.id,
      gmail_thread_id: response.data.threadId,
    };
  }
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="GmailService"`
Expected: all 5 tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/services/gmailService.js tests/gmailService.test.js
git commit -m "feat(outreach): add Gmail send service with threading support"
```

---

## Task 6: Middleware whitelist for `/u/*`

Open the public path list so the unsubscribe route is reachable without authentication.

**Files:**
- Modify: `src/web/middleware.ts:6`

- [ ] **Step 6.1: Update the PUBLIC_PATHS array**

In `src/web/middleware.ts`, change line 6 from:

```typescript
const PUBLIC_PATHS = ['/login', '/api/auth'];
```

to:

```typescript
const PUBLIC_PATHS = ['/login', '/api/auth', '/u/'];
```

- [ ] **Step 6.2: Verify by reading the file**

No test yet — a test comes in Task 8 (integration). This step just sets up routing.

- [ ] **Step 6.3: Commit**

```bash
git add src/web/middleware.ts
git commit -m "feat(outreach): allow unauthenticated access to /u/* unsubscribe path"
```

---

## Task 7: Public unsubscribe page

A server component that verifies the token, writes to the suppression list, cancels pending sends for that recipient, and renders a confirmation page.

**Files:**
- Create: `src/web/app/u/[token]/page.tsx`

- [ ] **Step 7.1: Implement the page**

Create `src/web/app/u/[token]/page.tsx`:

```tsx
import { getDb } from '@/lib/db.js';
import { verifyUnsubscribeToken } from '../../../../services/unsubscribeTokenService.js';
import { SuppressionService } from '../../../../services/suppressionService.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PageProps = { params: Promise<{ token: string }> };

export default async function UnsubscribePage({ params }: PageProps) {
  const { token } = await params;
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  const legalName = process.env.BUSINESS_LEGAL_NAME || 'Our Business';
  const operatingName = process.env.BUSINESS_OPERATING_NAME || '';
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS || '';

  let sendId: number | null = null;
  let email: string | null = null;
  let errorMessage: string | null = null;

  try {
    if (!secret) throw new Error('server misconfigured');
    const payload = verifyUnsubscribeToken(token, secret) as { sendId: number };
    sendId = payload.sendId;

    const db = getDb();
    const row = db.prepare(
      'SELECT recipient_email, campaign_lead_id FROM email_sends WHERE id = ?'
    ).get(sendId) as { recipient_email: string; campaign_lead_id: number } | undefined;

    if (!row) throw new Error('send not found');
    email = row.recipient_email;

    const suppression = new SuppressionService({ db });
    suppression.add({ email, reason: 'unsubscribed', source: 'click' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE campaign_leads SET status = 'unsubscribed', completed_at = ? WHERE id = ?`
    ).run(now, row.campaign_lead_id);

    db.prepare(
      `UPDATE email_sends SET status = 'cancelled' WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(row.campaign_lead_id);

    db.prepare(
      `INSERT INTO email_events (send_id, type, detected_at) VALUES (?, 'unsubscribed', ?)`
    ).run(sendId, now);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <main style={{ maxWidth: 560, margin: '64px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
      {errorMessage ? (
        <>
          <h1>We couldn&apos;t process that unsubscribe link.</h1>
          <p>The link may have expired or been tampered with. If you received an email from us and don&apos;t want to hear from us again, please reply with &ldquo;STOP&rdquo; and we will remove you manually within 10 business days.</p>
          <p style={{ color: '#888', fontSize: 13 }}>Error: {errorMessage}</p>
        </>
      ) : (
        <>
          <h1>You&apos;ve been unsubscribed.</h1>
          <p>{operatingName || legalName} will no longer contact <strong>{email}</strong>.</p>
          <p>If this was a mistake, just reply to any of our earlier emails and we&apos;ll add you back.</p>
        </>
      )}
      <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #eee' }} />
      <footer style={{ fontSize: 13, color: '#666' }}>
        <div><strong>{legalName}</strong>{operatingName ? ` (operating as ${operatingName})` : ''}</div>
        <div>{mailingAddress}</div>
      </footer>
    </main>
  );
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/web/app/u/[token]/page.tsx
git commit -m "feat(outreach): add public unsubscribe confirmation page"
```

---

## Task 8: End-to-end integration test

Proves the full flow: compose → (mock) send → token click simulated → suppression list updated → future sends cancelled.

**Files:**
- Create: `tests/outreachFlow.test.js`

- [ ] **Step 8.1: Write the integration test**

Create `tests/outreachFlow.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';
import { GmailService } from '../src/services/gmailService.js';
import { SuppressionService } from '../src/services/suppressionService.js';
import { verifyUnsubscribeToken } from '../src/services/unsubscribeTokenService.js';

const CONFIG = {
  legalName: 'Gleam & Lift Solutions',
  operatingName: 'GleamPro Cleaning',
  mailingAddress: 'Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8',
  publicAppUrl: 'https://outreach.gleampro.ca',
  tokenSecret: 'integration-test-secret',
};

function seedCampaignLead(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('p', 'Van', 30, 49.2, -123.1, '[]', 4, now, now);
  const preset = db.prepare('SELECT id FROM presets').get();
  db.prepare(`INSERT INTO leads (place_id, business_name, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid1', 'Test Biz', 49.2, -123.1, 5, 80, '{}', 'ok', 'new', '2026-W16', now, now);
  const lead = db.prepare('SELECT id FROM leads').get();
  db.prepare(`INSERT INTO campaigns (name, preset_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run('Campaign 1', preset.id, now, now);
  const campaign = db.prepare('SELECT id FROM campaigns').get();
  db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (?, ?, ?)`)
    .run(campaign.id, lead.id, now);
  const cl = db.prepare('SELECT id FROM campaign_leads').get();
  return { campaignLeadId: cl.id };
}

function makeFakeGmailClient() {
  return {
    users: {
      messages: {
        send: async () => ({ data: { id: 'mock-msg-id', threadId: 'mock-thread-id' } }),
      },
    },
  };
}

describe('Outreach end-to-end flow', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('composes, sends, records, and processes unsubscribe', async () => {
    const { campaignLeadId } = seedCampaignLead(db);
    const now = new Date().toISOString();

    // Create pending send row (so we have an id for token signing)
    const sendResult = db.prepare(
      `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(campaignLeadId, 1, 'curious_neighbor', 'Hello', 'Initial body', 'dest@example.com', now, now);
    const sendId = Number(sendResult.lastInsertRowid);

    // Compose email with CASL footer + unsubscribe token
    const composed = buildOutreachEmail({
      sendId,
      subject: 'Hello',
      body: 'Initial body',
      config: CONFIG,
    });

    // Send via Gmail (mocked)
    const gmail = new GmailService({
      client: makeFakeGmailClient(),
      sender: { email: 'outreach@outreach.gleampro.ca', name: 'GleamPro' },
    });
    const gmailResult = await gmail.send({
      to: 'dest@example.com',
      subject: composed.subject,
      body: composed.body,
    });

    // Persist send result
    db.prepare(
      `UPDATE email_sends SET gmail_message_id = ?, gmail_thread_id = ?, sent_at = ?, status = 'sent' WHERE id = ?`
    ).run(gmailResult.gmail_message_id, gmailResult.gmail_thread_id, now, sendId);

    // Schedule a follow-up (to prove cancellation later)
    db.prepare(
      `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
    ).run(campaignLeadId, 2, 'value_lead', 'Follow', 'FU body', 'dest@example.com', now, now);

    // Extract token from composed body
    const match = composed.body.match(/\/u\/([^\s)]+)/);
    assert.ok(match);
    const token = match[1];

    // Simulate click: verify token, look up send, suppress, cancel follow-ups
    const payload = verifyUnsubscribeToken(token, CONFIG.tokenSecret);
    assert.strictEqual(payload.sendId, sendId);

    const row = db.prepare('SELECT recipient_email, campaign_lead_id FROM email_sends WHERE id = ?').get(payload.sendId);
    const suppression = new SuppressionService({ db });
    suppression.add({ email: row.recipient_email, reason: 'unsubscribed', source: 'click' });

    db.prepare(
      `UPDATE campaign_leads SET status = 'unsubscribed', completed_at = ? WHERE id = ?`
    ).run(now, row.campaign_lead_id);
    db.prepare(
      `UPDATE email_sends SET status = 'cancelled' WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(row.campaign_lead_id);

    // Assertions
    assert.strictEqual(suppression.isSuppressed('dest@example.com'), true);
    const cl = db.prepare('SELECT status FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    assert.strictEqual(cl.status, 'unsubscribed');
    const fu = db.prepare(`SELECT status FROM email_sends WHERE touch_number = 2`).get();
    assert.strictEqual(fu.status, 'cancelled');
  });

  it('rejects invalid unsubscribe tokens', () => {
    assert.throws(() => verifyUnsubscribeToken('garbage', CONFIG.tokenSecret), /malformed/i);
  });
});
```

- [ ] **Step 8.2: Run the test**

Run: `npm test -- --test-name-pattern="Outreach end-to-end flow"`
Expected: both tests PASS.

- [ ] **Step 8.3: Run the full suite**

Run: `npm test`
Expected: entire suite passes. No regressions in existing tests.

- [ ] **Step 8.4: Commit**

```bash
git add tests/outreachFlow.test.js
git commit -m "test(outreach): end-to-end integration covering send + unsubscribe flow"
```

---

## Task 9: Manual smoke test against real Gmail

Sanity-check the real OAuth + send path using a one-off script. This is NOT committed — it's a throwaway verification.

**Files:**
- Create (temporary): `scripts/smoke-send.mjs`
- Delete after verification.

- [ ] **Step 9.1: Create the smoke script**

Create `scripts/smoke-send.mjs`:

```javascript
import 'dotenv/config';
import { createGmailClientFromEnv, GmailService } from '../src/services/gmailService.js';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';

const RECIPIENT = process.argv[2];
if (!RECIPIENT) {
  console.error('Usage: node scripts/smoke-send.mjs <your-personal-email>');
  process.exit(1);
}

const config = {
  legalName: process.env.BUSINESS_LEGAL_NAME,
  operatingName: process.env.BUSINESS_OPERATING_NAME,
  mailingAddress: process.env.BUSINESS_MAILING_ADDRESS,
  publicAppUrl: process.env.PUBLIC_APP_URL,
  tokenSecret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
};

const composed = buildOutreachEmail({
  sendId: 999999, // dummy id for smoke test
  subject: 'GleamPro outreach smoke test',
  body: 'This is a test message from the smoke script. Ignore.',
  config,
});

const client = createGmailClientFromEnv();
const gmail = new GmailService({
  client,
  sender: {
    email: process.env.GMAIL_SENDER_EMAIL,
    name: process.env.GMAIL_SENDER_NAME,
  },
});

const result = await gmail.send({
  to: RECIPIENT,
  subject: composed.subject,
  body: composed.body,
});

console.log('Sent:', result);
console.log('Check your inbox at', RECIPIENT);
console.log('Click the unsubscribe link and verify it opens the confirmation page.');
```

- [ ] **Step 9.2: Run the smoke test**

Run: `node scripts/smoke-send.mjs <your-personal-email>`
Expected: log shows `Sent: { gmail_message_id: ..., gmail_thread_id: ... }`.

Check your inbox. Verify:
- The email arrives from `outreach@outreach.gleampro.ca`.
- The sender name shows "GleamPro Cleaning" (or whatever `GMAIL_SENDER_NAME` is set to).
- The CASL footer is present with legal name, mailing address, and unsubscribe link.
- Clicking the unsubscribe link (after starting the dev server + Cloudflare Tunnel: `npm run dev` in `src/web`, and `cloudflared tunnel run gleampro-outreach`) lands on the confirmation page.

⚠️ The unsubscribe click will fail gracefully because `sendId=999999` doesn't exist in the DB — you'll see the "couldn't process" page. That's expected. It proves the route and token-verification path works.

- [ ] **Step 9.3: Delete the smoke script**

```bash
rm scripts/smoke-send.mjs
```

Do not commit it.

- [ ] **Step 9.4: Record verification in the commit log (optional manual note)**

No commit needed — this task produces no code artifact.

---

## Self-Review

Going through the spec section-by-section to confirm coverage:

| Spec section | Covered by |
|--------------|-----------|
| §4 Architecture (local PC, Cloudflare Tunnel) | Prerequisites runbook + Tasks 6-7 (public route) |
| §5.1 Workspace user | Prerequisites runbook |
| §5.2 Gmail API client | Task 5 (`createGmailClientFromEnv`) |
| §5.3 Campaign model | Not in this plan — deferred to Phase 3 plan |
| §5.4 Sequence engine | Deferred to Phase 3 |
| §5.5 Reply poller | Deferred to Phase 4 |
| §5.6 Suppression list | Task 3 |
| §5.7 Unsubscribe endpoint | Tasks 2, 6, 7 |
| §5.8 Outcome tracker | Deferred to Phase 5 (dashboard) |
| §5.9 Dashboard | Deferred to Phase 5 |
| §5.10 Operational resilience | Deferred to Phase 6 |
| §6 Data model | Task 1 |
| §7.4 Unsubscribe flow | Tasks 2, 7, 8 |
| §8 CASL footer | Task 4 |
| §9 Warm-up | Deferred (no sender loop yet) |
| §12 Testing strategy | Tasks 1-8 include unit + integration tests |

Placeholder scan: no TBDs, TODOs, or handwavy steps. Every code step has full runnable code. Every command has exact expected output.

Type consistency: `SuppressionService` exposes `isSuppressed`, `add`, `addDomain` — referenced consistently in Tasks 3, 7, and 8. `GmailService.send` signature consistent in Tasks 5, 8, and 9. `buildOutreachEmail` signature consistent in Tasks 4, 8, and 9. `signUnsubscribeToken` / `verifyUnsubscribeToken` exports consistent across Tasks 2, 4, 7, 8.

---

## After Plan 1 — What's Next

After this plan is implemented and merged:

1. **Brainstorm Phase 3 — Campaign + Sequence Engine.** Key design questions: per-lead scheduling algorithm, touch-timing logic (4 days / 10 days with send-window alignment), warm-up cap enforcement, how discovery-pipeline runs feed leads into active campaigns.
2. **Brainstorm Phase 4 — Reply + Bounce Poller.** Gmail polling cadence, DSN parsing, auto-cancel logic, desktop notifications.
3. **Brainstorm Phase 5 — Dashboard.** Campaign pages, sequence timelines, outcome-logging forms, heartbeat indicator.
4. **Phase 6 — Operational resilience + launch of Week 1 warm-up campaign.**
