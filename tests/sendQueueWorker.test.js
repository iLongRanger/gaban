import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';
import { SendQueueWorker } from '../src/services/sendQueueWorker.js';
import { SuppressionService } from '../src/services/suppressionService.js';

const ENV = {
  BUSINESS_LEGAL_NAME: 'Gleam & Lift Solutions',
  BUSINESS_OPERATING_NAME: 'GleamPro Cleaning',
  BUSINESS_MAILING_ADDRESS: 'Suite 6 - 1209 Fourth Avenue, New Westminster, BC V3M 1T8',
  PUBLIC_APP_URL: 'https://bot.gleamlift.ca',
  UNSUBSCRIBE_TOKEN_SECRET: 'test-secret',
};

function seedCampaign(db, { startAt = '2026-05-04T16:00:00.000Z', dailyCap = 5 } = {}) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Restaurants', 'New Westminster', 10, 49.2, -123.1, '["restaurants"]', 5, now, now);
  const preset = db.prepare('SELECT * FROM presets').get();
  const leadResult = db.prepare(`INSERT INTO leads
    (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid-a', 'Lead A', 'lead@example.com', 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W18', now, now);
  const leadId = Number(leadResult.lastInsertRowid);
  for (const style of ['touch_1', 'touch_2', 'touch_3']) {
    db.prepare(`INSERT INTO outreach_drafts
      (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadId, style, `Subject ${style}`, `Body ${style}`, `DM ${style}`, now, now);
  }
  const campaign = new CampaignService({ db }).createCampaign({
    presetId: preset.id,
    name: 'Restaurant Week',
    leadIds: [leadId],
    startAt,
    dailyCap,
  });
  return campaign;
}

describe('SendQueueWorker', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  const permissiveValidator = { validate: async () => ({ valid: true, reason: null }) };

  it('sends one due email and records Gmail ids', async () => {
    seedCampaign(db);
    const sent = [];
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      validator: permissiveValidator,
      mailer: {
        send: async (message) => {
          sent.push(message);
          return { gmail_message_id: 'msg-1', gmail_thread_id: 'thr-1', gmail_rfc_message_id: '<msg-1@mail.gmail.com>' };
        },
      },
    });

    const result = await worker.tick({ now: new Date('2026-05-04T16:00:00.000Z'), limit: 1 });

    assert.deepStrictEqual(result, [{ id: 1, status: 'sent' }]);
    assert.strictEqual(sent.length, 1);
    assert.ok(sent[0].body.includes('Unsubscribe: https://bot.gleamlift.ca/u/'));
    const send = db.prepare('SELECT * FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.status, 'sent');
    assert.strictEqual(send.gmail_message_id, 'msg-1');
    assert.strictEqual(send.gmail_rfc_message_id, '<msg-1@mail.gmail.com>');
  });

  it('defers instead of sending when the warm-up cap is reached', async () => {
    seedCampaign(db, { dailyCap: 0 });
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      validator: permissiveValidator,
      mailer: {
        send: async () => {
          throw new Error('should not send');
        },
      },
    });

    const result = await worker.tick({ now: new Date('2026-05-04T16:00:00.000Z'), limit: 1 });

    assert.deepStrictEqual(result, [{ id: 1, status: 'deferred' }]);
    const send = db.prepare('SELECT status, error_message, scheduled_for FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.status, 'scheduled');
    assert.strictEqual(send.error_message, 'deferred: warm-up cap reached');
    assert.strictEqual(send.scheduled_for, '2026-05-05T16:00:00.000Z');
  });

  it('cancels due sends for suppressed recipients', async () => {
    seedCampaign(db);
    new SuppressionService({ db }).add({ email: 'lead@example.com', reason: 'manual', source: 'operator' });
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      validator: permissiveValidator,
      mailer: {
        send: async () => {
          throw new Error('should not send');
        },
      },
    });

    const result = await worker.tick({ now: new Date('2026-05-04T16:00:00.000Z'), limit: 1 });

    assert.deepStrictEqual(result, [{ id: 1, status: 'cancelled' }]);
    const send = db.prepare('SELECT status, error_message FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.status, 'cancelled');
    assert.strictEqual(send.error_message, 'recipient suppressed');
  });

  function seedScheduledSend(db, { recipient_email = 'test@example.com' } = {}) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Test', 'Vancouver', 10, 49.2, -123.1, '["test"]', 5, now, now);
    const preset = db.prepare('SELECT * FROM presets LIMIT 1').get();
    const leadResult = db.prepare(`INSERT INTO leads
      (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('pid-seed', 'Seed Biz', recipient_email, 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W21', now, now);
    const leadId = Number(leadResult.lastInsertRowid);
    for (const style of ['touch_1', 'touch_2', 'touch_3']) {
      db.prepare(`INSERT INTO outreach_drafts
        (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(leadId, style, `Subj ${style}`, `Body ${style}`, `DM ${style}`, now, now);
    }
    const campaign = new CampaignService({ db }).createCampaign({
      presetId: preset.id,
      name: 'Seed Campaign',
      leadIds: [leadId],
      startAt: '2026-05-21T15:00:00.000Z',
      dailyCap: 5,
    });
    const send = db.prepare('SELECT id FROM email_sends WHERE campaign_lead_id IN (SELECT id FROM campaign_leads WHERE campaign_id = ?) LIMIT 1').get(campaign.id);
    db.prepare('UPDATE email_sends SET recipient_email = ? WHERE id = ?').run(recipient_email, send.id);
    return send.id;
  }

  function createTestWorker({ validator } = {}) {
    const calls = [];
    const mailer = {
      calls,
      send: async (message) => {
        calls.push(message);
        return { gmail_message_id: 'msg-x', gmail_thread_id: 'thr-x', gmail_rfc_message_id: '<msg-x@mail.gmail.com>' };
      },
    };
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      mailer,
      validator,
    });
    return { worker, db, mailer };
  }

  it('cancels send when recipient fails validation', async () => {
    const { worker, db: testDb } = createTestWorker({
      validator: { validate: async () => ({ valid: false, reason: 'no_mx_records' }) },
    });
    const sendId = seedScheduledSend(testDb, { recipient_email: 'broken@nowhere.invalid' });

    await worker.tick({ now: new Date('2026-05-21T17:00:00Z'), limit: 1 });

    const row = testDb.prepare('SELECT status, error_message FROM email_sends WHERE id = ?').get(sendId);
    assert.equal(row.status, 'cancelled');
    assert.match(row.error_message, /invalid_recipient: no_mx_records/);

    const evt = testDb.prepare('SELECT type, raw_payload FROM email_events WHERE send_id = ?').get(sendId);
    assert.equal(evt.type, 'cancelled');
    assert.match(evt.raw_payload, /invalid_recipient/);
  });

  it('passes through to mailer when validator approves', async () => {
    const { worker, db: testDb, mailer } = createTestWorker({
      validator: { validate: async () => ({ valid: true, reason: null }) },
    });
    const sendId = seedScheduledSend(testDb, { recipient_email: 'real@example.com' });

    await worker.tick({ now: new Date('2026-05-21T17:00:00Z'), limit: 1 });

    assert.equal(mailer.calls.length, 1);
    const row = testDb.prepare('SELECT status FROM email_sends WHERE id = ?').get(sendId);
    assert.equal(row.status, 'sent');
  });

  it('reschedules overdue sends after a long worker gap', async () => {
    seedCampaign(db, { startAt: '2026-05-01T16:00:00.000Z' });
    db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('outreach.last_send_worker_tick', ?, ?)`
    ).run('2026-05-01T16:00:00.000Z', '2026-05-01T16:00:00.000Z');
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      validator: permissiveValidator,
      mailer: {
        send: async () => {
          throw new Error('should not send overdue queue immediately');
        },
      },
    });

    const result = await worker.tick({ now: new Date('2026-05-05T01:30:00.000Z'), limit: 1 });

    assert.deepStrictEqual(result, []);
    const send = db.prepare('SELECT scheduled_for, error_message FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.scheduled_for, '2026-05-05T16:00:00.000Z');
    assert.match(send.error_message, /missed send window/);
    const gap = db.prepare("SELECT value FROM system_settings WHERE key = 'outreach.last_send_worker_gap'").get();
    assert.ok(gap.value.includes('rescheduled_sends'));
  });

  it('finalizes a single-touch campaign after the final touch when grace is 0', async () => {
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES ('outreach.finish_grace_hours', '0', ?)`)
      .run(new Date().toISOString());
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
});
