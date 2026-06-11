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
  for (const style of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
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
    assert.strictEqual(sends.length, 8);
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

  it('pauses and resumes campaigns', () => {
    const preset = seedPreset(db);
    const leadId = seedLeadWithDrafts(db, 'pause');
    const service = new CampaignService({ db });
    const campaign = service.createCampaign({
      presetId: preset.id,
      name: 'Pause campaign',
      leadIds: [leadId],
      startAt: '2026-05-04T16:00:00.000Z',
    });

    assert.strictEqual(service.pauseCampaign(campaign.id), true);
    assert.strictEqual(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaign.id).status, 'paused');
    assert.strictEqual(service.resumeCampaign(campaign.id), true);
    assert.strictEqual(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaign.id).status, 'active');
  });

  it('shifts pending sends forward when a paused campaign resumes', () => {
    const preset = seedPreset(db);
    const leadId = seedLeadWithDrafts(db, 'shift');
    const service = new CampaignService({ db });
    const campaign = service.createCampaign({
      presetId: preset.id,
      name: 'Shift campaign',
      leadIds: [leadId],
      startAt: '2026-05-04T16:00:00.000Z',
    });

    service.pauseCampaign(campaign.id, { at: '2026-05-04T17:00:00.000Z' });
    assert.strictEqual(service.resumeCampaign(campaign.id, { at: '2026-05-09T18:00:00.000Z' }), true);

    const sends = db.prepare('SELECT touch_number, scheduled_for FROM email_sends ORDER BY touch_number').all();
    assert.deepStrictEqual(sends.map((send) => send.scheduled_for), [
      '2026-05-11T16:00:00.000Z',
      '2026-05-15T16:00:00.000Z',
      '2026-05-25T16:00:00.000Z',
      '2026-06-09T16:00:00.000Z',
    ]);
  });

  it('reschedules only remaining touches when touch 1 was already sent', () => {
    const preset = seedPreset(db);
    const leadId = seedLeadWithDrafts(db, 'partial');
    const service = new CampaignService({ db });
    const campaign = service.createCampaign({
      presetId: preset.id,
      name: 'Partial campaign',
      leadIds: [leadId],
      startAt: '2026-05-04T16:00:00.000Z',
    });
    db.prepare("UPDATE email_sends SET status = 'sent', sent_at = ? WHERE touch_number = 1")
      .run('2026-05-04T16:00:00.000Z');

    service.pauseCampaign(campaign.id, { at: '2026-05-05T17:00:00.000Z' });
    service.resumeCampaign(campaign.id, { at: '2026-05-09T18:00:00.000Z' });

    const sends = db.prepare('SELECT touch_number, status, scheduled_for FROM email_sends ORDER BY touch_number').all();
    assert.strictEqual(sends[0].scheduled_for, '2026-05-04T16:00:00.000Z');
    assert.deepStrictEqual(sends.slice(1).map((send) => send.scheduled_for), [
      '2026-05-11T16:00:00.000Z',
      '2026-05-19T16:00:00.000Z',
      '2026-06-03T16:00:00.000Z',
    ]);
  });

  it('schedules four touches and assigns each lead an opener arm', () => {
    const preset = seedPreset(db);
    const leadA = seedLeadWithDrafts(db, 'arm-a');
    const leadB = seedLeadWithDrafts(db, 'arm-b');

    const service = new CampaignService({ db });
    const campaign = service.createCampaign({
      presetId: preset.id,
      name: 'rebuild test',
      leadIds: [leadA, leadB],
      startAt: '2026-06-11T16:00:00Z',
    });

    const rows = db.prepare(`
      SELECT cl.lead_id, es.touch_number, es.template_style
      FROM email_sends es JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? ORDER BY cl.lead_id, es.touch_number
    `).all(campaign.id);

    // Each lead must have exactly 4 touches.
    const perLead = new Map();
    for (const r of rows) perLead.set(r.lead_id, (perLead.get(r.lead_id) || 0) + 1);
    for (const count of perLead.values()) assert.equal(count, 4);

    // Touch 1 arm is determined by lead-id parity.
    const t1 = (leadId) => rows.find((r) => r.lead_id === leadId && r.touch_number === 1).template_style;
    const expectedArmA = Number(leadA) % 2 === 0 ? 'touch_1_poke' : 'touch_1_route';
    const expectedArmB = Number(leadB) % 2 === 0 ? 'touch_1_poke' : 'touch_1_route';
    assert.equal(t1(leadA), expectedArmA);
    assert.equal(t1(leadB), expectedArmB);
    // The two leads must be assigned different arms (50/50 split).
    assert.notEqual(t1(leadA), t1(leadB));

    // Touch 4 must use the touch_4 style.
    const t4 = rows.find((r) => r.touch_number === 4).template_style;
    assert.equal(t4, 'touch_4');
  });

  it('cancels future sends for a campaign lead', () => {
    const preset = seedPreset(db);
    const leadId = seedLeadWithDrafts(db, 'cancel');
    const service = new CampaignService({ db });
    service.createCampaign({
      presetId: preset.id,
      name: 'Cancel campaign',
      leadIds: [leadId],
      startAt: '2026-05-04T16:00:00.000Z',
    });
    const campaignLead = db.prepare('SELECT id FROM campaign_leads LIMIT 1').get();

    const changed = service.cancelFutureSends(campaignLead.id, { reason: 'manual pause' });

    assert.strictEqual(changed, 4);
    const remaining = db.prepare("SELECT COUNT(*) AS c FROM email_sends WHERE status = 'scheduled'").get();
    assert.strictEqual(remaining.c, 0);
    const cancelled = db.prepare("SELECT COUNT(*) AS c FROM email_sends WHERE status = 'cancelled'").get();
    assert.strictEqual(cancelled.c, 4);
  });
});
