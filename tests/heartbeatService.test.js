import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { HeartbeatService } from '../src/services/heartbeatService.js';

describe('HeartbeatService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('reports outreach counts and Gmail readiness', () => {
    const now = '2026-05-04T16:00:00.000Z';
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'New Westminster', 10, 49.2, -123.1, '["offices"]', 5, now, now);
    db.prepare(`INSERT INTO campaigns (name, preset_id, status, created_at, updated_at) VALUES (?, 1, 'active', ?, ?)`)
      .run('C', now, now);
    db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('pid-1', 'Lead', 'lead@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W18', now, now);
    db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (1, 1, ?)`).run(now);
    db.prepare(`INSERT INTO email_sends
      (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, sent_at, status, created_at)
      VALUES (1, 1, 'curious_neighbor', 'S', 'B', 'lead@example.com', ?, ?, 'sent', ?)`)
      .run(now, now, now);
    db.prepare(`INSERT INTO email_sends
      (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, status, created_at)
      VALUES (1, 2, 'value_lead', 'S', 'B', 'lead@example.com', ?, 'scheduled', ?)`)
      .run('2026-05-08T16:00:00.000Z', now);
    db.prepare(`INSERT INTO email_events (send_id, type, detected_at) VALUES (1, 'replied', ?)`).run(now);

    const snapshot = new HeartbeatService({
      db,
      env: {
        GMAIL_OAUTH_CLIENT_ID: 'id',
        GMAIL_OAUTH_CLIENT_SECRET: 'secret',
        GMAIL_OAUTH_REFRESH_TOKEN: 'refresh',
        GMAIL_SENDER_EMAIL: 'outreach@example.com',
      },
    }).snapshot({ now: new Date(now) });

    assert.strictEqual(snapshot.gmail_configured, true);
    assert.strictEqual(snapshot.active_campaigns, 1);
    assert.strictEqual(snapshot.scheduled_sends, 1);
    assert.strictEqual(snapshot.sent_today, 1);
    assert.strictEqual(snapshot.replies_waiting, 1);
    assert.strictEqual(snapshot.next_send_at, '2026-05-08T16:00:00.000Z');
  });
});
