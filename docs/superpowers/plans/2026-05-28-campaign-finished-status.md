# Campaign Finished Status + Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically transition an outreach campaign to a `finished` status with a frozen performance summary once its sequence has run out and a configurable grace window has elapsed.

**Architecture:** `campaignService.finalizeIfDone()` owns the status transition; `MetricsService.campaignSummary()` is the single summary computation used both to freeze the snapshot and to serve a live API endpoint. Finalization fires event-driven (worker after final touch, monitor after a lead goes terminal) plus a periodic sweep backstop in the background worker.

**Tech Stack:** Node 22 ESM, `node:test`, `better-sqlite3`, Next.js 16 / React 19, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-28-campaign-finished-status-design.md`

---

## File Structure

**Create:**
- `src/web/app/api/campaigns/[id]/summary/route.ts` — GET endpoint returning a live `campaignSummary`.
- `tests/campaignFinalize.test.js` — tests for `finalizeIfDone` / `finalizeAllActive`.

**Modify:**
- `src/web/lib/db.js` — add `finished_at` + `summary` columns to `campaigns` (CREATE TABLE + `ensureColumn`).
- `src/services/metricsService.js` — add `campaignSummary(campaignId, { now })`; import `classifyVertical`.
- `src/services/campaignService.js` — add `TERMINAL_LEAD_STATUSES`, `finalizeIfDone()`, `finalizeAllActive()`; import `MetricsService`; add `readSetting` helper.
- `src/services/sendQueueWorker.js` — inject `CampaignService`; add `campaign_id`/`touch_styles` to `dueSends`; call `finalizeIfDone` after the final touch sends.
- `src/services/emailResponseMonitor.js` — call `finalizeIfDone` after a lead is marked terminal.
- `src/worker/background.js` — add a ~15-min sweep cron calling `finalizeAllActive`.
- `src/web/app/(app)/campaigns/[id]/page.tsx` — render a "Results" panel + `finished` status tag.
- `tests/metricsService.test.js` — add `campaignSummary` tests.

**Schema note:** No migration framework. Use the existing `ensureColumn` pattern (`db.js:226`).

---

## Task 1: Schema Columns

**Files:**
- Modify: `src/web/lib/db.js`
- Test: covered indirectly; add a quick assertion in `tests/campaignFinalize.test.js` (Task 3). No separate test here.

- [ ] **Step 1: Add columns to the campaigns CREATE TABLE**

In `src/web/lib/db.js`, in the `campaigns` table definition, add two columns after `touch_styles` (before `created_at`):

```sql
  touch_styles       TEXT NOT NULL DEFAULT '["touch_1","touch_2","touch_3"]',
  finished_at        TEXT,
  summary            TEXT,
  created_at         TEXT NOT NULL,
```

- [ ] **Step 2: Add ensureColumn calls for existing DBs**

In `initDb`, alongside the existing `ensureColumn` calls (`db.js:239-240`), add:

```javascript
  ensureColumn(db, 'campaigns', 'finished_at', 'TEXT');
  ensureColumn(db, 'campaigns', 'summary', 'TEXT');
```

- [ ] **Step 3: Verify schema loads**

Run: `node --input-type=module -e "import {initDb} from './src/web/lib/db.js'; const db=initDb(':memory:'); console.log(db.pragma('table_info(campaigns)').map(c=>c.name).filter(n=>['finished_at','summary'].includes(n)));"`
Expected: `[ 'finished_at', 'summary' ]`

- [ ] **Step 4: Commit**

```bash
git add src/web/lib/db.js
git commit -m "feat: add finished_at and summary columns to campaigns"
```

---

## Task 2: MetricsService.campaignSummary

**Files:**
- Modify: `src/services/metricsService.js`
- Test: `tests/metricsService.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/metricsService.test.js` (it already imports `initDb` and `MetricsService` and defines `makeDb`, `seedSend`, `seedEvent`). Add this block at the end of the file:

```javascript
import { classifyVertical } from '../src/services/verticalClassifier.js';

function seedLeadTyped(db, { leadId, campaignLeadId, type, status = 'active' }) {
  const now = '2026-05-15T12:00:00Z';
  db.prepare(`INSERT INTO leads (id, place_id, business_name, type, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
              VALUES (?, ?, 'Biz', ?, 'b@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W20', ?, ?)`)
    .run(leadId, `pid-${leadId}`, type, now, now);
  db.prepare(`INSERT INTO campaign_leads (id, campaign_id, lead_id, status, touch_count, added_at)
              VALUES (?, 1, ?, ?, 3, ?)`)
    .run(campaignLeadId, leadId, status, now);
}

function seedTypedSend(db, { id, campaignLeadId, touch_number, sent_at = '2026-05-15T12:00:00Z' }) {
  db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, sent_at, scheduled_for, created_at)
              VALUES (?, ?, ?, ?, 's', 'b', 'b@example.com', 'sent', ?, ?, ?)`)
    .run(id, campaignLeadId, touch_number, `touch_${touch_number}`, sent_at, sent_at, sent_at);
}

test('campaignSummary returns totals, per-touch, per-vertical, and outcomes', () => {
  const db = makeDb();
  // base preset+campaign(id=1) created lazily by seedSend; seed one to bootstrap them
  seedSend(db, { id: 999, template_style: 'touch_1', status: 'cancelled' });
  db.prepare("DELETE FROM email_sends WHERE id = 999").run();
  db.prepare("DELETE FROM campaign_leads WHERE id = 1").run();

  // Restaurant lead, replied at touch 1
  seedLeadTyped(db, { leadId: 10, campaignLeadId: 10, type: 'Restaurant', status: 'replied' });
  seedTypedSend(db, { id: 1, campaignLeadId: 10, touch_number: 1 });
  seedTypedSend(db, { id: 2, campaignLeadId: 10, touch_number: 2 });
  seedEvent(db, { send_id: 1, type: 'replied' });
  // Office lead, bounced at touch 1
  seedLeadTyped(db, { leadId: 11, campaignLeadId: 11, type: 'Insurance broker', status: 'bounced' });
  seedTypedSend(db, { id: 3, campaignLeadId: 11, touch_number: 1 });
  seedEvent(db, { send_id: 3, type: 'bounced' });

  const metrics = new MetricsService({ db });
  const s = metrics.campaignSummary(1, { now: new Date('2026-05-20T12:00:00Z') });

  assert.equal(s.totals.sent, 3);
  assert.equal(s.totals.replied, 1);
  assert.equal(s.totals.bounced, 1);
  assert.equal(s.totals.reply_rate.toFixed(2), '0.33');

  const t1 = s.by_touch.find((r) => r.touch === 1);
  assert.equal(t1.sent, 2);
  assert.equal(t1.replied, 1);

  const restaurant = s.by_vertical.find((r) => r.vertical === 'restaurant');
  assert.equal(restaurant.sent, 2);
  assert.equal(restaurant.replied, 1);
  const office = s.by_vertical.find((r) => r.vertical === 'office');
  assert.equal(office.sent, 1);

  assert.equal(s.leads, 2);
  assert.equal(typeof s.duration_days, 'number');
});

test('campaignSummary returns null for an unknown campaign', () => {
  const db = makeDb();
  assert.equal(new MetricsService({ db }).campaignSummary(424242), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/metricsService.test.js`
Expected: FAIL — `campaignSummary is not a function`.

- [ ] **Step 3: Implement campaignSummary**

In `src/services/metricsService.js`, add the import at the top of the file (above `export class MetricsService`):

```javascript
import { classifyVertical } from './verticalClassifier.js';
```

Then add this method inside the `MetricsService` class (after `outreachFunnel`):

```javascript
  campaignSummary(campaignId, { now = new Date() } = {}) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return null;

    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
    const leads = this.db.prepare(
      'SELECT COUNT(*) AS c FROM campaign_leads WHERE campaign_id = ?'
    ).get(campaignId).c;

    const rows = this.db.prepare(`
      SELECT es.id AS send_id, es.touch_number, l.type AS lead_type,
        SUM(CASE WHEN ev.type = 'replied'      THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN ev.type = 'bounced'      THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN ev.type = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed
      FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN email_events ev ON ev.send_id = es.id
      WHERE cl.campaign_id = ? AND es.status = 'sent'
      GROUP BY es.id
    `).all(campaignId);

    const totals = { sent: 0, replied: 0, bounced: 0, unsubscribed: 0 };
    const touchMap = new Map();
    const vertMap = new Map();

    for (const r of rows) {
      const replied = r.replied || 0;
      const bounced = r.bounced || 0;
      const unsubscribed = r.unsubscribed || 0;
      totals.sent += 1;
      totals.replied += replied;
      totals.bounced += bounced;
      totals.unsubscribed += unsubscribed;

      const t = touchMap.get(r.touch_number) || { touch: r.touch_number, sent: 0, replied: 0, bounced: 0 };
      t.sent += 1; t.replied += replied; t.bounced += bounced;
      touchMap.set(r.touch_number, t);

      const vertical = classifyVertical({ type: r.lead_type });
      const v = vertMap.get(vertical) || { vertical, sent: 0, replied: 0 };
      v.sent += 1; v.replied += replied;
      vertMap.set(vertical, v);
    }

    const totalsOut = {
      ...totals,
      reply_rate: totals.sent ? totals.replied / totals.sent : 0,
      bounce_rate: totals.sent ? totals.bounced / totals.sent : 0,
    };
    const by_touch = [...touchMap.values()].sort((a, b) => a.touch - b.touch);
    const by_vertical = [...vertMap.values()]
      .map((v) => ({ ...v, reply_rate: v.sent ? v.replied / v.sent : 0 }))
      .sort((a, b) => b.sent - a.sent);

    const outcomes = { interested: 0, not_interested: 0, meeting_booked: 0, contract_signed: 0 };
    for (const r of this.db.prepare(
      'SELECT status, COUNT(*) AS c FROM campaign_leads WHERE campaign_id = ? GROUP BY status'
    ).all(campaignId)) {
      if (r.status in outcomes) outcomes[r.status] = r.c;
    }

    const startedRow = this.db.prepare(`
      SELECT MIN(es.sent_at) AS started
      FROM email_sends es JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? AND es.status = 'sent'
    `).get(campaignId);
    const started_at = startedRow.started || campaign.created_at;
    const end = campaign.finished_at || nowIso;
    const duration_days = Math.max(
      0,
      Math.round((new Date(end).getTime() - new Date(started_at).getTime()) / 86400000)
    );

    return {
      finished_at: campaign.finished_at || null,
      started_at,
      duration_days,
      leads,
      totals: totalsOut,
      by_touch,
      outcomes,
      by_vertical,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --test tests/metricsService.test.js`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/services/metricsService.js tests/metricsService.test.js
git commit -m "feat: add campaignSummary funnel+outcomes aggregation to MetricsService"
```

---

## Task 3: campaignService.finalizeIfDone + finalizeAllActive

**Files:**
- Modify: `src/services/campaignService.js`
- Test: `tests/campaignFinalize.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/campaignFinalize.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';

const NOW = new Date('2026-05-20T12:00:00Z');

function setGrace(db, hours) {
  db.prepare(`INSERT INTO system_settings (key, value, updated_at)
              VALUES ('outreach.finish_grace_hours', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(String(hours), NOW.toISOString());
}

function seedCampaign(db, { status = 'active', touchStyles = '["touch_1","touch_2","touch_3"]' } = {}) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO presets (id, name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
              VALUES (1, 'P', 'V', 10, 49.2, -123.1, '["x"]', 5, ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO campaigns (id, name, preset_id, status, touch_styles, created_at, updated_at)
              VALUES (1, 'C', 1, ?, ?, ?, ?)`).run(status, touchStyles, now, now);
}

function seedLead(db, { leadId, campaignLeadId, status, touch_count = 0, last_touch_at = null }) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO leads (id, place_id, business_name, type, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
              VALUES (?, ?, 'B', 'Restaurant', 'b@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W20', ?, ?)`)
    .run(leadId, `pid-${leadId}`, now, now);
  db.prepare(`INSERT INTO campaign_leads (id, campaign_id, lead_id, status, touch_count, last_touch_at, added_at)
              VALUES (?, 1, ?, ?, ?, ?, ?)`)
    .run(campaignLeadId, leadId, status, touch_count, last_touch_at, now);
}

function seedSend(db, { id, campaignLeadId, touch_number, status }) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, scheduled_for, created_at)
              VALUES (?, ?, ?, ?, 's', 'b', 'b@example.com', ?, ?, ?)`)
    .run(id, campaignLeadId, touch_number, `touch_${touch_number}`, status, now, now);
}

test('does not finish when scheduled sends remain', () => {
  const db = initDb(':memory:');
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 1 });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 2, status: 'scheduled' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'sends_pending');
});

test('does not finish a silent lead still within the grace window', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  // last touch sent 10h ago -> within 48h grace
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-20T02:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'lead_in_progress');
});

test('finishes a silent lead past the grace window and freezes a summary', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  // last touch sent 3 days ago -> past 48h grace
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-17T12:00:00Z' });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 3, status: 'sent' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
  const row = db.prepare('SELECT status, finished_at, summary FROM campaigns WHERE id = 1').get();
  assert.equal(row.status, 'finished');
  assert.ok(row.finished_at);
  assert.ok(JSON.parse(row.summary).totals);
});

test('finishes when all leads terminate early even though touch 3 never sent', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'bounced', touch_count: 1, last_touch_at: '2026-05-19T12:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = 1').get().status, 'finished');
});

test('does not finish when a lead is still queued', () => {
  const db = initDb(':memory:');
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'queued', touch_count: 0 });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'lead_queued');
});

test('never finishes a paused campaign', () => {
  const db = initDb(':memory:');
  seedCampaign(db, { status: 'paused' });
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'bounced', touch_count: 1 });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'not_active');
});

test('grace hours setting of 0 finishes immediately after final touch', () => {
  const db = initDb(':memory:');
  setGrace(db, 0);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: NOW.toISOString() });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
});

test('finalizeAllActive finishes every eligible active campaign', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'replied', touch_count: 1 });
  const finished = new CampaignService({ db }).finalizeAllActive(NOW);
  assert.deepEqual(finished, [1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/campaignFinalize.test.js`
Expected: FAIL — `finalizeIfDone is not a function`.

- [ ] **Step 3: Implement finalizeIfDone, finalizeAllActive, and helpers**

In `src/services/campaignService.js`:

a) Add imports/constants at the top (after the existing `import` line):

```javascript
import { nextSendTime, scheduleSequence } from './sequenceScheduler.js';
import { MetricsService } from './metricsService.js';

const DEFAULT_TOUCH_STYLES = ['touch_1', 'touch_2', 'touch_3'];
const TOUCH_OFFSETS = { 1: 0, 2: 4, 3: 10 };
const TERMINAL_LEAD_STATUSES = new Set([
  'replied', 'bounced', 'auto_replied', 'unsubscribed',
  'interested', 'not_interested', 'out_of_scope', 'meeting_booked', 'contract_signed',
]);

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row?.value;
}
```

(Note: `DEFAULT_TOUCH_STYLES` and `TOUCH_OFFSETS` already exist — do not duplicate them; only add `MetricsService` import, `TERMINAL_LEAD_STATUSES`, and `readSetting`.)

b) Add these two methods inside the `CampaignService` class (after `cancelFutureSends`):

```javascript
  finalizeIfDone(campaignId, now = new Date()) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return { finished: false, reason: 'not_found' };
    if (campaign.status !== 'active') return { finished: false, reason: 'not_active' };

    const nowDate = now instanceof Date ? now : new Date(now);
    const maxTouches = parseJson(campaign.touch_styles, DEFAULT_TOUCH_STYLES).length;
    const graceHours = Number(readSetting(this.db, 'outreach.finish_grace_hours')) || 48;
    const graceCutoff = new Date(nowDate.getTime() - graceHours * 3600 * 1000).toISOString();

    const pending = this.db.prepare(`
      SELECT COUNT(*) AS c FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? AND es.status IN ('scheduled', 'sending')
    `).get(campaignId).c;
    if (pending > 0) return { finished: false, reason: 'sends_pending' };

    const leads = this.db.prepare(
      'SELECT status, touch_count, last_touch_at FROM campaign_leads WHERE campaign_id = ?'
    ).all(campaignId);
    if (leads.length === 0) return { finished: false, reason: 'no_leads' };

    for (const lead of leads) {
      if (lead.status === 'queued') return { finished: false, reason: 'lead_queued' };
      if (TERMINAL_LEAD_STATUSES.has(lead.status)) continue;
      const exhausted =
        lead.status === 'active' &&
        lead.touch_count >= maxTouches &&
        lead.last_touch_at &&
        lead.last_touch_at <= graceCutoff;
      if (!exhausted) return { finished: false, reason: 'lead_in_progress' };
    }

    const summary = new MetricsService({ db: this.db }).campaignSummary(campaignId, { now: nowDate });
    const finishedAt = nowDate.toISOString();
    this.db.prepare(
      `UPDATE campaigns SET status = 'finished', finished_at = ?, summary = ?, updated_at = ? WHERE id = ?`
    ).run(finishedAt, JSON.stringify(summary), finishedAt, campaignId);
    return { finished: true };
  }

  finalizeAllActive(now = new Date()) {
    const active = this.db.prepare("SELECT id FROM campaigns WHERE status = 'active'").all();
    const finished = [];
    for (const c of active) {
      if (this.finalizeIfDone(c.id, now).finished) finished.push(c.id);
    }
    return finished;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --test tests/campaignFinalize.test.js`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/campaignService.js tests/campaignFinalize.test.js
git commit -m "feat: add campaign finalize logic with grace window"
```

---

## Task 4: Worker Event Hook

**Files:**
- Modify: `src/services/sendQueueWorker.js`
- Test: `tests/sendQueueWorker.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/sendQueueWorker.test.js`, inside the `describe('SendQueueWorker', ...)` block (it has `db`, `ENV`, `seedCampaign`, `permissiveValidator` in scope). Add:

```javascript
  it('finalizes a single-touch campaign after the final touch when grace is 0', async () => {
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES ('outreach.finish_grace_hours', '0', ?)`)
      .run(new Date().toISOString());
    // build a campaign whose sequence is a single touch
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES ('P','V',10,49.2,-123.1,'["x"]',5,?,?)`).run(now, now);
    const preset = db.prepare('SELECT * FROM presets ORDER BY id DESC LIMIT 1').get();
    const leadRes = db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
      VALUES ('pid-solo','Solo','solo@example.com',49.2,-123.1,2,90,'{}','ok','new','2026-W18',?,?)`).run(now, now);
    const leadId = Number(leadRes.lastInsertRowid);
    db.prepare(`INSERT INTO outreach_drafts (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
      VALUES (?, 'touch_1', 'S', 'B', 'D', ?, ?)`).run(leadId, now, now);
    const campaign = new CampaignService({ db }).createCampaign({
      presetId: preset.id, name: 'Solo', leadIds: [leadId],
      startAt: '2026-05-04T16:00:00.000Z', touchStyles: ['touch_1'],
    });

    const worker = new SendQueueWorker({
      db, env: ENV, validator: permissiveValidator,
      mailer: { send: async () => ({ gmail_message_id: 'm', gmail_thread_id: 't', gmail_rfc_message_id: '<m@x>' }) },
    });
    await worker.tick({ now: new Date('2026-05-04T16:00:00.000Z'), limit: 1 });

    const row = db.prepare('SELECT status, summary FROM campaigns WHERE id = ?').get(campaign.id);
    assert.strictEqual(row.status, 'finished');
    assert.ok(JSON.parse(row.summary).totals);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/sendQueueWorker.test.js`
Expected: FAIL — campaign status stays `active` (no finalize hook yet).

- [ ] **Step 3: Wire CampaignService and the finalize hook**

In `src/services/sendQueueWorker.js`:

a) Add the import at the top (with the other imports):

```javascript
import { CampaignService } from './campaignService.js';
```

b) In the constructor, add `campaignService` to the destructured options and assign it (after the `this.usage` line):

```javascript
  constructor({ db, mailer, env = process.env, capService, suppressionService, validator, campaignService, logger = console }) {
    if (!db) throw new Error('db required');
    if (!mailer) throw new Error('mailer required');
    this.db = db;
    this.mailer = mailer;
    this.env = env;
    this.capService = capService || new WarmupCapService({ db });
    this.suppressionService = suppressionService || new SuppressionService({ db });
    this.validator = validator || new RecipientValidator();
    this.usage = new UsageService({ db });
    this.campaignService = campaignService || new CampaignService({ db });
    this.logger = logger;
  }
```

c) In `dueSends`, add `c.id` and `c.touch_styles` to the SELECT list (so the hook can read them off `send`):

```javascript
      `SELECT es.*, cl.status AS campaign_lead_status, c.status AS campaign_status,
              c.id AS campaign_id, c.touch_styles AS campaign_touch_styles,
              c.daily_cap, c.timezone, c.send_window_start, c.send_window_end, c.send_days
       FROM email_sends es
       JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE es.status = 'scheduled'
         AND es.scheduled_for <= ?
       ORDER BY es.scheduled_for ASC, es.id ASC
       LIMIT ?`
```

d) In `processSend`, in the success path, after the `campaign_leads` UPDATE (the block ending at `).run(send.touch_number, sentAt, send.campaign_lead_id);`) and before the `this.usage.safeRecord(...)` call, insert:

```javascript
      try {
        const maxTouches = JSON.parse(send.campaign_touch_styles || '[]').length || 3;
        if (send.touch_number >= maxTouches) {
          this.campaignService.finalizeIfDone(send.campaign_id, now);
        }
      } catch (hookErr) {
        this.logger.error?.(`finalize hook failed: ${hookErr.message}`);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --test tests/sendQueueWorker.test.js`
Expected: PASS — including the new finalize test and all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/sendQueueWorker.js tests/sendQueueWorker.test.js
git commit -m "feat: finalize campaign from send worker after final touch"
```

---

## Task 5: Monitor Event Hook

**Files:**
- Modify: `src/services/emailResponseMonitor.js`
- Test: `tests/campaignFinalize.test.js` (add a focused unit test of the hook behavior via CampaignService, since the monitor needs Gmail mocks)

**Why:** When the *last* outstanding lead replies/bounces after the rest are already past grace, the campaign should finish immediately rather than waiting for the next sweep.

- [ ] **Step 1: Add the finalize call after a lead is marked terminal**

In `src/services/emailResponseMonitor.js`, in `_processMessage` (or the method containing the `apply()` transaction — around line 143-157), after the `apply();` call and before the `return`, add:

```javascript
    if (shouldCompleteLead) {
      const link = this.db.prepare('SELECT campaign_id FROM campaign_leads WHERE id = ?').get(send.campaign_lead_id);
      if (link?.campaign_id) {
        try {
          this.campaigns.finalizeIfDone(link.campaign_id, now);
        } catch (hookErr) {
          this.logger?.error?.(`finalize hook failed: ${hookErr.message}`);
        }
      }
    }
```

(`this.campaigns` is the existing `CampaignService` instance created in the constructor; `now` is the method parameter.)

- [ ] **Step 2: Add a regression test for the underlying behavior**

Append to `tests/campaignFinalize.test.js`:

```javascript
test('last lead going terminal finishes a campaign whose other leads are past grace', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  // lead 1: silent, past grace; lead 2: just replied
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-17T12:00:00Z' });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 3, status: 'sent' });
  seedLead(db, { leadId: 2, campaignLeadId: 2, status: 'replied', touch_count: 2, last_touch_at: '2026-05-19T12:00:00Z' });
  seedSend(db, { id: 2, campaignLeadId: 2, touch_number: 2, status: 'sent' });

  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx node --test tests/campaignFinalize.test.js`
Expected: PASS — including the new test.

- [ ] **Step 4: Smoke-check the monitor still imports cleanly**

Run: `node --input-type=module -e "import('./src/services/emailResponseMonitor.js').then(()=>console.log('ok'))"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add src/services/emailResponseMonitor.js tests/campaignFinalize.test.js
git commit -m "feat: finalize campaign when last lead goes terminal"
```

---

## Task 6: Sweep Backstop Cron

**Files:**
- Modify: `src/worker/background.js`

**Why:** The grace-window case is finished by neither event hook (the final touch is too recent), so a periodic sweep is the primary finalizer once grace elapses. `finalizeAllActive` is already unit-tested (Task 3); this task only wires the cron.

- [ ] **Step 1: Add the import and guard flag**

In `src/worker/background.js`, add to the imports (with the other service imports):

```javascript
import { CampaignService } from '../services/campaignService.js';
```

And add a guard flag with the others (near `let healthCheckRunning = false;`):

```javascript
let finalizeRunning = false;
```

- [ ] **Step 2: Add the sweep cron**

In `main()`, after the health-check `cron.schedule('*/10 * * * *', ...)` block, add:

```javascript
  cron.schedule('*/15 * * * *', () => {
    if (finalizeRunning) return;
    finalizeRunning = true;
    try {
      const finished = new CampaignService({ db }).finalizeAllActive(new Date());
      if (finished.length) console.log(`Finalized campaigns: ${finished.join(', ')}`);
    } catch (err) {
      console.error(`Campaign finalize sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      finalizeRunning = false;
    }
  }, { timezone: TIMEZONE });
```

- [ ] **Step 3: Verify the worker module loads**

Run: `node --check src/worker/background.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add src/worker/background.js
git commit -m "feat: periodic sweep to finalize completed campaigns"
```

---

## Task 7: Live Summary API Route

**Files:**
- Create: `src/web/app/api/campaigns/[id]/summary/route.ts`

- [ ] **Step 1: Create the route**

Create `src/web/app/api/campaigns/[id]/summary/route.ts`:

```typescript
import '@/lib/loadEnv.js';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { MetricsService } from '../../../../../../services/metricsService.js';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const Metrics = MetricsService as any;
  const summary = new Metrics({ db: getDb() }).campaignSummary(Number(id), { now: new Date() });
  if (!summary) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json(summary);
}
```

(The `../../../../../../services/` depth matches the sibling `[id]/pause/route.ts`.)

- [ ] **Step 2: Verify the web build compiles**

Run: `npm run build:web`
Expected: build succeeds with no type errors referencing the new route.

- [ ] **Step 3: Commit**

```bash
git add "src/web/app/api/campaigns/[id]/summary/route.ts"
git commit -m "feat: live campaign summary API endpoint"
```

---

## Task 8: Results Panel on Campaign Detail Page

**Files:**
- Modify: `src/web/app/(app)/campaigns/[id]/page.tsx`

**Note:** `CampaignActions.tsx` already returns `null` for any status other than `active`/`paused`, so a `finished` campaign automatically hides pause/resume — no change needed there.

- [ ] **Step 1: Add a status tag color for finished**

In `src/web/app/(app)/campaigns/[id]/page.tsx`, extend `statusTagClass` so `finished` reads as an accent tag. Change the first line of the function body:

```typescript
function statusTagClass(status: string) {
  if (['sent', 'replied', 'finished'].includes(status)) return 'tag tag--accent';
  if (['failed', 'bounced'].includes(status)) return 'tag tag--danger';
  if (['unsubscribed', 'sending', 'scheduled'].includes(status)) return 'tag tag--warn';
  if (status === 'cancelled') return 'tag tag--mute';
  return 'tag';
}
```

- [ ] **Step 2: Render the Results panel when finished**

In the same file, after the stats grid `</div>` (the `grid grid-cols-7` block that ends at the line before `<div className="space-y-3">`), insert a Results panel. Add this just before `<div className="space-y-3">`:

```tsx
      {campaign.status === 'finished' && campaign.summary ? (() => {
        const s = JSON.parse(campaign.summary);
        return (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Results</h2>
              <span className="text-xs text-gray-400">
                Finished {formatDate(campaign.finished_at)} · {s.duration_days}d · {s.leads} leads
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
              <div><span className="block text-xs text-gray-400">Sent</span><span className="font-medium">{s.totals.sent}</span></div>
              <div><span className="block text-xs text-gray-400">Replied</span><span className="font-medium">{s.totals.replied} ({(s.totals.reply_rate * 100).toFixed(1)}%)</span></div>
              <div><span className="block text-xs text-gray-400">Bounced</span><span className="font-medium">{s.totals.bounced} ({(s.totals.bounce_rate * 100).toFixed(1)}%)</span></div>
              <div><span className="block text-xs text-gray-400">Contracts</span><span className="font-medium">{s.outcomes.contract_signed}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">By touch</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-400"><th>Touch</th><th>Sent</th><th>Replied</th><th>Bounced</th></tr></thead>
                  <tbody>
                    {s.by_touch.map((r: any) => (
                      <tr key={r.touch}><td>{r.touch}</td><td>{r.sent}</td><td>{r.replied}</td><td>{r.bounced}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">By vertical</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-400"><th>Vertical</th><th>Sent</th><th>Replied</th><th>Reply %</th></tr></thead>
                  <tbody>
                    {s.by_vertical.map((r: any) => (
                      <tr key={r.vertical}><td>{r.vertical}</td><td>{r.sent}</td><td>{r.replied}</td><td>{(r.reply_rate * 100).toFixed(1)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })() : null}
```

- [ ] **Step 3: Verify the web build compiles**

Run: `npm run build:web`
Expected: build succeeds.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. In SQLite, manually finish a test campaign to populate the panel, e.g.:

```bash
node --input-type=module -e "
import { initDb } from './src/web/lib/db.js';
import { CampaignService } from './src/services/campaignService.js';
const db = initDb();
// pick an active campaign with no scheduled sends; force grace to 0 for the check
db.prepare(\"INSERT INTO system_settings (key,value,updated_at) VALUES ('outreach.finish_grace_hours','0',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='0'\").run();
console.log(new CampaignService({ db }).finalizeAllActive(new Date()));
"
```

Visit `http://localhost:3010/campaigns/<id>` for a finished campaign and confirm the Results panel renders with totals, by-touch, and by-vertical tables. Also hit `http://localhost:3010/api/campaigns/<id>/summary` and confirm JSON.

Restore the grace setting afterward (`outreach.finish_grace_hours` back to `48`, or delete the key).

- [ ] **Step 5: Commit**

```bash
git add "src/web/app/(app)/campaigns/[id]/page.tsx"
git commit -m "feat: show results panel on finished campaign detail page"
```

---

## Task 9: Full Suite + Push

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS — all suites (≈210+ tests), including the new `campaignFinalize`, `metricsService`, and `sendQueueWorker` cases.

- [ ] **Step 2: Push**

Per user preference, push to `main` when tests pass:

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Schema (`finished_at`, `summary`) → Task 1.
- `finalizeIfDone` condition incl. grace window + early-terminal + per-campaign maxTouches → Task 3.
- Configurable `outreach.finish_grace_hours` (default 48) → Task 3 (`readSetting` + `|| 48`), tested with override 0/48.
- `campaignSummary` (totals, rates, by_touch, outcomes, by_vertical via `classifyVertical`) → Task 2.
- Snapshot freeze at finish + live recompute via one function → Task 3 (freeze) + Task 7 (live endpoint), both call `MetricsService.campaignSummary`.
- Event triggers (worker after final touch; monitor on terminal) → Tasks 4 & 5.
- Sweep backstop → Task 6.
- Surfacing (detail panel; finished status tag; pause/resume auto-hidden) → Task 8.

**Placeholder scan:** none — every code/test step contains final code; commands have expected outputs.

**Type consistency:** `finalizeIfDone(campaignId, now)` returns `{ finished, reason? }` used consistently in Tasks 3–6. `campaignSummary(campaignId, { now })` shape (`totals`, `by_touch`, `outcomes`, `by_vertical`, `leads`, `duration_days`, `finished_at`, `started_at`) is identical across Task 2 (impl + test), Task 7 (endpoint), and Task 8 (panel). `TERMINAL_LEAD_STATUSES` defined once in Task 3.

**Note for implementer:** `DEFAULT_TOUCH_STYLES` and `TOUCH_OFFSETS` already exist in `campaignService.js`; Task 3 Step 3a only adds the `MetricsService` import, `TERMINAL_LEAD_STATUSES`, and `readSetting` — do not redeclare the existing constants.
