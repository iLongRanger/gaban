import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';

function seedPreset(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Restaurants', 'New Westminster', 10, 49.2, -123.1, '["restaurants"]', 5, now, now);
  return db.prepare('SELECT * FROM presets').get();
}

function seedLeadWithDrafts(db, suffix) {
  const now = new Date().toISOString();
  const leadResult = db.prepare(`INSERT INTO leads
    (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`pid-${suffix}`, `Lead ${suffix}`, `lead${suffix}@example.com`, 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W18', now, now);
  const leadId = Number(leadResult.lastInsertRowid);
  for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
    db.prepare(`INSERT INTO outreach_drafts
      (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadId, style, `Subject ${style}`, `Body ${style}`, `DM ${style}`, now, now);
  }
  return leadId;
}

describe('CampaignService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('creates an active campaign from manually selected leads', () => {
    const preset = seedPreset(db);
    const leadA = seedLeadWithDrafts(db, 'a');
    const leadB = seedLeadWithDrafts(db, 'b');

    const service = new CampaignService({ db });
    const campaign = service.createCampaign({
      presetId: preset.id,
      name: 'Restaurant Week 1',
      leadIds: [leadA, leadB],
      startAt: '2026-05-04T16:00:00.000Z',
      dailyCap: 5,
    });

    assert.strictEqual(campaign.status, 'active');
    const campaignLeads = db.prepare('SELECT COUNT(*) AS c FROM campaign_leads').get();
    assert.strictEqual(campaignLeads.c, 2);
    const sends = db.prepare('SELECT * FROM email_sends ORDER BY scheduled_for, id').all();
    assert.strictEqual(sends.length, 6);
    assert.strictEqual(sends[0].scheduled_for, '2026-05-04T16:00:00.000Z');
    assert.strictEqual(sends[1].scheduled_for, '2026-05-04T16:02:00.000Z');
  });

  it('rejects leads without an email address', () => {
    const preset = seedPreset(db);
    const now = new Date().toISOString();
    const leadResult = db.prepare(`INSERT INTO leads
      (place_id, business_name, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('pid-no-email', 'No Email', 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W18', now, now);

    const service = new CampaignService({ db });
    assert.throws(() => {
      service.createCampaign({
        presetId: preset.id,
        name: 'Bad campaign',
        leadIds: [Number(leadResult.lastInsertRowid)],
        startAt: '2026-05-04T16:00:00.000Z',
      });
    }, /does not have an email/i);
  });
});
