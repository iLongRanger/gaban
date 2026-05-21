import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { MetricsService } from '../src/services/metricsService.js';

function makeDb() {
  return initDb(':memory:');
}

function seedSend(db, { id, template_style, status = 'sent', sent_at = '2026-05-15T12:00:00Z', recipient_email = 'x@example.com' }) {
  // Ensure parent chain exists: preset -> campaign -> lead -> campaign_lead
  const now = sent_at;
  const checkPreset = db.prepare('SELECT id FROM presets WHERE id = 1').get();
  if (!checkPreset) {
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
                VALUES ('Test', 'Vancouver', 50, 49.28, -123.12, '["test"]', 10, ?, ?)`)
      .run(now, now);
  }
  const checkCampaign = db.prepare('SELECT id FROM campaigns WHERE id = 1').get();
  if (!checkCampaign) {
    db.prepare(`INSERT INTO campaigns (name, preset_id, status, created_at, updated_at)
                VALUES ('Test', 1, 'active', ?, ?)`)
      .run(now, now);
  }
  const checkLead = db.prepare('SELECT id FROM leads WHERE id = 1').get();
  if (!checkLead) {
    db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
                VALUES ('pid-1', 'Lead', 'lead@example.com', 49.28, -123.12, 2, 80, '{}', 'ok', 'new', '2026-W20', ?, ?)`)
      .run(now, now);
  }
  const checkCampaignLead = db.prepare('SELECT id FROM campaign_leads WHERE id = 1').get();
  if (!checkCampaignLead) {
    db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at)
                VALUES (1, 1, ?)`)
      .run(now);
  }

  db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, sent_at, scheduled_for, created_at)
              VALUES (?, 1, 1, ?, 's', 'b', ?, ?, ?, ?, ?)`)
    .run(id, template_style, recipient_email, status, sent_at, sent_at, now);
}

function seedEvent(db, { send_id, type, detected_at = '2026-05-16T12:00:00Z' }) {
  db.prepare(`INSERT INTO email_events (send_id, type, detected_at, raw_payload) VALUES (?, ?, ?, '{}')`)
    .run(send_id, type, detected_at);
}

test('outreachFunnel returns counts and rates per template_style', () => {
  const db = makeDb();
  // 4 touch_1 sent, 1 replied, 1 bounced
  seedSend(db, { id: 1, template_style: 'touch_1' });
  seedSend(db, { id: 2, template_style: 'touch_1' });
  seedSend(db, { id: 3, template_style: 'touch_1' });
  seedSend(db, { id: 4, template_style: 'touch_1' });
  seedEvent(db, { send_id: 1, type: 'replied' });
  seedEvent(db, { send_id: 2, type: 'bounced' });
  // 2 touch_2 sent, 0 replies
  seedSend(db, { id: 5, template_style: 'touch_2' });
  seedSend(db, { id: 6, template_style: 'touch_2' });

  const metrics = new MetricsService({ db });
  const result = metrics.outreachFunnel({ since: '2026-05-01T00:00:00Z' });

  const t1 = result.by_template.find((r) => r.template_style === 'touch_1');
  assert.equal(t1.sent, 4);
  assert.equal(t1.replied, 1);
  assert.equal(t1.bounced, 1);
  assert.equal(t1.reply_rate.toFixed(2), '0.25');
  assert.equal(t1.bounce_rate.toFixed(2), '0.25');

  assert.equal(result.totals.sent, 6);
  assert.equal(result.totals.replied, 1);
});

test('outreachFunnel honors the since filter', () => {
  const db = makeDb();
  seedSend(db, { id: 1, template_style: 'touch_1', sent_at: '2026-04-01T00:00:00Z' });
  seedSend(db, { id: 2, template_style: 'touch_1', sent_at: '2026-05-15T00:00:00Z' });
  const metrics = new MetricsService({ db });
  const result = metrics.outreachFunnel({ since: '2026-05-01T00:00:00Z' });
  assert.equal(result.totals.sent, 1);
});

test('outreachFunnel counts one send only once even when it has multiple events', () => {
  const db = makeDb();
  seedSend(db, { id: 10, template_style: 'touch_1' });
  seedEvent(db, { send_id: 10, type: 'bounced' });
  seedEvent(db, { send_id: 10, type: 'replied' });

  const metrics = new MetricsService({ db });
  const result = metrics.outreachFunnel({ since: '2026-05-01T00:00:00Z' });
  const t1 = result.by_template.find((r) => r.template_style === 'touch_1');
  assert.equal(t1.sent, 1);
  assert.equal(t1.bounced, 1);
  assert.equal(t1.replied, 1);
});
