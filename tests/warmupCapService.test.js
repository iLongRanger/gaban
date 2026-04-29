import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { WarmupCapService } from '../src/services/warmupCapService.js';

function seedSent(db, sentAt) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`P-${sentAt}`, 'Vancouver', 30, 49.2, -123.1, '[]', 4, now, now);
  const preset = db.prepare('SELECT id FROM presets ORDER BY id DESC LIMIT 1').get();
  db.prepare(`INSERT INTO campaigns (name, preset_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(`C-${sentAt}`, preset.id, now, now);
  const campaign = db.prepare('SELECT id FROM campaigns ORDER BY id DESC LIMIT 1').get();
  db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`pid-${sentAt}`, 'Biz', 'x@example.com', 49.2, -123.1, 1, 90, '{}', 'ok', 'new', '2026-W18', now, now);
  const lead = db.prepare('SELECT id FROM leads ORDER BY id DESC LIMIT 1').get();
  db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (?, ?, ?)`)
    .run(campaign.id, lead.id, now);
  const campaignLead = db.prepare('SELECT id FROM campaign_leads ORDER BY id DESC LIMIT 1').get();
  db.prepare(`INSERT INTO email_sends
    (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, sent_at, status, created_at)
    VALUES (?, 1, 'curious_neighbor', 'S', 'B', 'x@example.com', ?, ?, 'sent', ?)`)
    .run(campaignLead.id, sentAt, sentAt, now);
}

describe('WarmupCapService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('blocks sends once the daily cap is reached', () => {
    seedSent(db, '2026-05-04T16:00:00.000Z');
    seedSent(db, '2026-05-04T16:05:00.000Z');

    const service = new WarmupCapService({ db });
    const result = service.canSend({
      campaign: { daily_cap: 2 },
      at: new Date('2026-05-04T18:00:00.000Z'),
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.cap, 2);
  });

  it('uses the warm-up ladder from system settings when configured', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)`)
      .run('outreach.warmup_start_date', '2026-05-04', now);
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)`)
      .run('outreach.warmup_ladder', '[5,10,15,20]', now);

    const service = new WarmupCapService({ db });
    assert.strictEqual(service.getDailyCap({ at: new Date('2026-05-04T16:00:00.000Z') }), 5);
    assert.strictEqual(service.getDailyCap({ at: new Date('2026-05-11T16:00:00.000Z') }), 10);
  });
});
