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
  for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
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

  it('sends one due email and records Gmail ids', async () => {
    seedCampaign(db);
    const sent = [];
    const worker = new SendQueueWorker({
      db,
      env: ENV,
      mailer: {
        send: async (message) => {
          sent.push(message);
          return { gmail_message_id: 'msg-1', gmail_thread_id: 'thr-1' };
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
  });

  it('defers instead of sending when the warm-up cap is reached', async () => {
    seedCampaign(db, { dailyCap: 0 });
    const worker = new SendQueueWorker({
      db,
      env: ENV,
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

  it('reschedules overdue sends after a long worker gap', async () => {
    seedCampaign(db, { startAt: '2026-05-01T16:00:00.000Z' });
    db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('outreach.last_send_worker_tick', ?, ?)`
    ).run('2026-05-01T16:00:00.000Z', '2026-05-01T16:00:00.000Z');
    const worker = new SendQueueWorker({
      db,
      env: ENV,
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
});
