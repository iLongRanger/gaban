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

  it('includes 7d outreach health metrics', () => {
    const now = new Date('2026-05-21T12:00:00.000Z');
    const within = '2026-05-18T12:00:00.000Z';
    const oneSendAt = within;

    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'New Westminster', 10, 49.2, -123.1, '["offices"]', 5, oneSendAt, oneSendAt);
    db.prepare(`INSERT INTO campaigns (name, preset_id, status, created_at, updated_at) VALUES (?, 1, 'active', ?, ?)`).run('C', oneSendAt, oneSendAt);
    db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('pid-1', 'Lead', 'lead@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W21', oneSendAt, oneSendAt);
    db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (1, 1, ?)`).run(oneSendAt);

    // 4 sent in window: 1 replied, 1 bounced
    for (let i = 1; i <= 4; i++) {
      db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, sent_at, status, created_at)
        VALUES (?, 1, 1, 'touch_1', 'S', 'B', 'lead@example.com', ?, ?, 'sent', ?)`)
        .run(i, oneSendAt, oneSendAt, oneSendAt);
    }
    db.prepare(`INSERT INTO email_events (send_id, type, detected_at, raw_payload) VALUES (1, 'replied', ?, '{}')`).run(within);
    db.prepare(`INSERT INTO email_events (send_id, type, detected_at, raw_payload) VALUES (2, 'bounced', ?, '{}')`).run(within);

    // 1 cancelled invalid_recipient in window
    db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, status, error_message, created_at)
      VALUES (5, 1, 1, 'touch_1', 'S', 'B', 'lead@example.com', ?, 'cancelled', 'invalid_recipient: no_mx_records', ?)`)
      .run(oneSendAt, oneSendAt);
    db.prepare(`INSERT INTO email_events (send_id, type, detected_at, raw_payload) VALUES (5, 'cancelled', ?, '{"reason":"invalid_recipient: no_mx_records"}')`).run(within);

    const snapshot = new HeartbeatService({ db, env: {} }).snapshot({ now });

    assert.equal(typeof snapshot.bounce_rate_7d, 'number');
    assert.equal(typeof snapshot.reply_rate_7d, 'number');
    assert.equal(typeof snapshot.invalid_recipient_rate_7d, 'number');
    // 1 reply / 4 sent = 0.25
    assert.equal(snapshot.reply_rate_7d.toFixed(2), '0.25');
    // 1 bounce / 4 sent = 0.25
    assert.equal(snapshot.bounce_rate_7d.toFixed(2), '0.25');
    // 1 invalid / 5 created in window = 0.2
    assert.equal(snapshot.invalid_recipient_rate_7d.toFixed(2), '0.20');
  });
});
