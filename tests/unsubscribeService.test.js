import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { getUnsubscribePreview, confirmUnsubscribe } from '../src/services/unsubscribeService.js';
import { signUnsubscribeToken } from '../src/services/unsubscribeTokenService.js';
import { SuppressionService } from '../src/services/suppressionService.js';

const SECRET = 'test-secret';

function seedSend(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('p', 'Van', 30, 49.2, -123.1, '[]', 10, now, now);
  const preset = db.prepare('SELECT id FROM presets').get();
  db.prepare(`INSERT INTO leads (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid1', 'Test Biz', 'dest@example.com', 49.2, -123.1, 5, 80, '{}', 'ok', 'new', '2026-W16', now, now);
  const lead = db.prepare('SELECT id FROM leads').get();
  db.prepare(`INSERT INTO campaigns (name, preset_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run('Campaign 1', preset.id, now, now);
  const campaign = db.prepare('SELECT id FROM campaigns').get();
  db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (?, ?, ?)`)
    .run(campaign.id, lead.id, now);
  const cl = db.prepare('SELECT id FROM campaign_leads').get();
  const sendResult = db.prepare(
    `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent')`
  ).run(cl.id, 1, 'curious_neighbor', 'Hello', 'Initial body', 'dest@example.com', now, now);
  db.prepare(
    `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
  ).run(cl.id, 2, 'value_lead', 'Follow', 'Follow body', 'dest@example.com', now, now);

  return {
    sendId: Number(sendResult.lastInsertRowid),
    campaignLeadId: cl.id
  };
}

describe('unsubscribeService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('previews an unsubscribe without suppressing or cancelling sends', () => {
    const { sendId } = seedSend(db);
    const token = signUnsubscribeToken({ sendId }, SECRET);

    const preview = getUnsubscribePreview({ db, token, secret: SECRET });

    assert.equal(preview.email, 'dest@example.com');
    assert.equal(new SuppressionService({ db }).isSuppressed('dest@example.com'), false);
    const followUp = db.prepare("SELECT status FROM email_sends WHERE touch_number = 2").get();
    assert.equal(followUp.status, 'scheduled');
  });

  it('confirms unsubscribe, suppresses email, and cancels future sends', () => {
    const { sendId, campaignLeadId } = seedSend(db);
    const token = signUnsubscribeToken({ sendId }, SECRET);

    const result = confirmUnsubscribe({ db, token, secret: SECRET });

    assert.equal(result.email, 'dest@example.com');
    assert.equal(new SuppressionService({ db }).isSuppressed('dest@example.com'), true);
    const campaignLead = db.prepare('SELECT status FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    assert.equal(campaignLead.status, 'unsubscribed');
    const followUp = db.prepare("SELECT status FROM email_sends WHERE touch_number = 2").get();
    assert.equal(followUp.status, 'cancelled');
    const events = db.prepare("SELECT COUNT(*) AS count FROM email_events WHERE type = 'unsubscribed'").get();
    assert.equal(events.count, 1);
  });
});
