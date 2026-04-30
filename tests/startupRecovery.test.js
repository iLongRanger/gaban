import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { StartupRecovery } from '../src/services/startupRecovery.js';

function seedSend(db, { status = 'scheduled', scheduledFor = '2026-05-04T16:00:00.000Z' } = {}) {
  const now = '2026-05-04T15:00:00.000Z';
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'New Westminster', 10, 49.2, -123.1, '["offices"]', 5, now, now);
  db.prepare(`INSERT INTO campaigns (name, preset_id, status, created_at, updated_at) VALUES (?, 1, 'active', ?, ?)`)
    .run('C', now, now);
  db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`pid-${status}-${scheduledFor}`, 'Lead', 'lead@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W18', now, now);
  db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (1, 1, ?)`).run(now);
  db.prepare(`INSERT INTO email_sends
    (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, status, created_at)
    VALUES (1, 1, 'curious_neighbor', 'S', 'B', 'lead@example.com', ?, ?, ?)`)
    .run(scheduledFor, status, now);
}

describe('StartupRecovery', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('marks stale sending rows failed for manual review', () => {
    seedSend(db, { status: 'sending', scheduledFor: '2026-05-04T15:00:00.000Z' });
    const result = new StartupRecovery({ db, logger: {} }).run({
      now: new Date('2026-05-04T16:00:00.000Z'),
    });

    assert.strictEqual(result.stale_sending, 1);
    const send = db.prepare('SELECT status, error_message FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.status, 'failed');
    assert.match(send.error_message, /manual review/);
    const event = db.prepare('SELECT type FROM email_events WHERE send_id = 1').get();
    assert.strictEqual(event.type, 'startup_recovered');
  });

  it('reschedules missed sends instead of blasting overdue queue', () => {
    seedSend(db, { status: 'scheduled', scheduledFor: '2026-05-01T16:00:00.000Z' });
    const result = new StartupRecovery({ db, logger: {} }).run({
      now: new Date('2026-05-05T01:30:00.000Z'),
    });

    assert.strictEqual(result.missed_sends, 1);
    const send = db.prepare('SELECT status, scheduled_for, error_message FROM email_sends WHERE id = 1').get();
    assert.strictEqual(send.status, 'scheduled');
    assert.strictEqual(send.scheduled_for, '2026-05-05T16:00:00.000Z');
    assert.match(send.error_message, /missed send window/);
    const event = db.prepare('SELECT type FROM email_events WHERE send_id = 1').get();
    assert.strictEqual(event.type, 'missed_window');
  });
});
