import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { SuppressionService } from '../src/services/suppressionService.js';
import { CampaignService } from '../src/services/campaignService.js';
import {
  SEASONAL_TOUCH_STYLES,
  REASSIGNED_STATUS,
  selectSeasonalCohort,
  createSeasonalCampaign,
} from '../src/services/seasonalCampaignService.js';

const NOW = '2026-10-26T16:00:00.000Z';

function seedPreset(db, { id = 1 } = {}) {
  db.prepare(`INSERT INTO presets (id, name, location, radius_km, office_lat, office_lng, categories, top_n, is_default, created_at, updated_at)
              VALUES (?, 'Restaurants', 'Burnaby, BC', 10, 49.2, -123.1, '["restaurants"]', 5, 1, ?, ?)`)
    .run(id, NOW, NOW);
  return db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
}

function seedCampaign(db, { id, status = 'active' }) {
  db.prepare(`INSERT INTO campaigns (id, name, preset_id, status, daily_cap, start_date, touch_styles, created_at, updated_at)
              VALUES (?, ?, 1, ?, 5, ?, '["touch_1","touch_2","touch_3","touch_4"]', ?, ?)`)
    .run(id, `Campaign ${id}`, status, NOW, NOW, NOW);
}

function seedLead(db, suffix, { email = `lead${suffix}@example.com`, styles = SEASONAL_TOUCH_STYLES } = {}) {
  const result = db.prepare(`INSERT INTO leads
    (place_id, business_name, type, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, 'Restaurant', ?, 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W44', ?, ?)`)
    .run(`pid-${suffix}`, `Lead ${suffix}`, email, NOW, NOW);
  const leadId = Number(result.lastInsertRowid);
  for (const style of styles) {
    db.prepare(`INSERT INTO outreach_drafts (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadId, style, `subject ${style}`, `Body ${style}`, `DM ${style}`, NOW, NOW);
  }
  return leadId;
}

function joinCampaign(db, { campaignId, leadId, status = 'queued', touchCount = 0 }) {
  const result = db.prepare(`INSERT INTO campaign_leads
    (campaign_id, lead_id, status, touch_count, added_at) VALUES (?, ?, ?, ?, ?)`)
    .run(campaignId, leadId, status, touchCount, NOW);
  return Number(result.lastInsertRowid);
}

describe('selectSeasonalCohort', () => {
  let db;
  beforeEach(() => {
    db = initDb(':memory:');
    seedPreset(db);
    seedCampaign(db, { id: 1 });
  });

  it('selects queued leads, which have never been emailed', () => {
    const queued = seedLead(db, 'queued');
    const active = seedLead(db, 'active');
    joinCampaign(db, { campaignId: 1, leadId: queued, status: 'queued' });
    joinCampaign(db, { campaignId: 1, leadId: active, status: 'active' });

    const cohort = selectSeasonalCohort({ db });
    assert.deepEqual(cohort.map((row) => row.leadId), [queued]);
  });

  it('excludes queued leads that somehow already have a sent email', () => {
    const leadId = seedLead(db, 'sent');
    const rowId = joinCampaign(db, { campaignId: 1, leadId });
    db.prepare(`INSERT INTO email_sends
      (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, scheduled_for, sent_at, created_at)
      VALUES (?, 1, 'touch_1_poke', 's', 'b', 'b@example.com', 'sent', ?, ?, ?)`)
      .run(rowId, NOW, NOW, NOW);

    assert.deepEqual(selectSeasonalCohort({ db }), []);
  });

  it('keeps queued leads whose only sends were cancelled', () => {
    const leadId = seedLead(db, 'cancelled');
    const rowId = joinCampaign(db, { campaignId: 1, leadId });
    db.prepare(`INSERT INTO email_sends
      (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, scheduled_for, created_at)
      VALUES (?, 1, 'touch_1_poke', 's', 'b', 'b@example.com', 'cancelled', ?, ?)`)
      .run(rowId, NOW, NOW);

    assert.equal(selectSeasonalCohort({ db }).length, 1);
  });

  it('excludes suppressed and email-less leads', () => {
    const kept = seedLead(db, 'kept');
    const suppressed = seedLead(db, 'suppressed', { email: 'gone@example.com' });
    const noEmail = seedLead(db, 'noemail');
    db.prepare('UPDATE leads SET email = NULL WHERE id = ?').run(noEmail);
    for (const leadId of [kept, suppressed, noEmail]) joinCampaign(db, { campaignId: 1, leadId });
    new SuppressionService({ db }).add({ email: 'gone@example.com', reason: 'unsubscribed', source: 'test' });

    assert.deepEqual(selectSeasonalCohort({ db }).map((row) => row.leadId), [kept]);
  });

  it('collapses shared inboxes to one recipient', () => {
    const keeper = seedLead(db, 'keeper', { email: 'info@shared.example' });
    const dupe = seedLead(db, 'dupe', { email: 'Info@Shared.example ' });
    const keeperRow = joinCampaign(db, { campaignId: 1, leadId: keeper });
    const dupeRow = joinCampaign(db, { campaignId: 1, leadId: dupe });

    const cohort = selectSeasonalCohort({ db });
    assert.equal(cohort.length, 1);
    assert.equal(cohort[0].campaignLeadId, keeperRow);
    assert.deepEqual(cohort[0].duplicateCampaignLeadIds, [dupeRow]);
  });

  it('flags leads missing any of the four seasonal drafts', () => {
    const ready = seedLead(db, 'ready', { styles: SEASONAL_TOUCH_STYLES });
    // Has touch_3/touch_4 from an earlier generation but no wet-season copy.
    const partial = seedLead(db, 'partial', { styles: ['touch_3', 'touch_4'] });
    joinCampaign(db, { campaignId: 1, leadId: ready });
    joinCampaign(db, { campaignId: 1, leadId: partial });

    const byLead = new Map(selectSeasonalCohort({ db }).map((row) => [row.leadId, row]));
    assert.equal(byLead.get(ready).hasSeasonalDrafts, true);
    assert.equal(byLead.get(partial).hasSeasonalDrafts, false);
  });
});

describe('createSeasonalCampaign', () => {
  let db;
  beforeEach(() => {
    db = initDb(':memory:');
    seedPreset(db);
    seedCampaign(db, { id: 1 });
  });

  it('schedules the four seasonal touches in order', () => {
    const leadId = seedLead(db, 'a');
    joinCampaign(db, { campaignId: 1, leadId });
    const cohort = selectSeasonalCohort({ db });

    const campaign = createSeasonalCampaign({
      db, presetId: 1, name: 'Wet season 1', cohort, startAt: NOW, dailyCap: 10,
    });

    assert.deepEqual(campaign.touch_styles, SEASONAL_TOUCH_STYLES);
    const sends = db.prepare(`
      SELECT es.touch_number, es.template_style FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? ORDER BY es.touch_number
    `).all(campaign.id);
    assert.deepEqual(sends.map((s) => s.template_style), SEASONAL_TOUCH_STYLES);
    // The cold opener arms must not leak into a seasonal sequence.
    assert.equal(sends[0].template_style, 'touch_1_wet');
  });

  it('retires the old queued rows as reassigned, not recycled', () => {
    const keeper = seedLead(db, 'keeper', { email: 'info@shared.example' });
    const dupe = seedLead(db, 'dupe', { email: 'info@shared.example' });
    const keeperRow = joinCampaign(db, { campaignId: 1, leadId: keeper });
    const dupeRow = joinCampaign(db, { campaignId: 1, leadId: dupe });
    const cohort = selectSeasonalCohort({ db });

    createSeasonalCampaign({ db, presetId: 1, name: 'Wet season 1', cohort, startAt: NOW, dailyCap: 10 });

    for (const rowId of [keeperRow, dupeRow]) {
      const row = db.prepare('SELECT status, completed_at FROM campaign_leads WHERE id = ?').get(rowId);
      // These leads were never contacted, so 'recycled' would misdescribe what happened.
      assert.equal(row.status, REASSIGNED_STATUS);
      assert.ok(row.completed_at);
    }
  });

  it('releases a campaign that only queued leads were holding open', () => {
    const leadId = seedLead(db, 'a');
    joinCampaign(db, { campaignId: 1, leadId });
    // Every other lead on campaign 1 already terminated.
    const done = seedLead(db, 'done');
    joinCampaign(db, { campaignId: 1, leadId: done, status: 'bounced' });

    const before = new CampaignService({ db }).finalizeIfDone(1, new Date('2026-11-30T00:00:00Z'));
    assert.equal(before.finished, false);
    assert.equal(before.reason, 'lead_queued');

    createSeasonalCampaign({
      db, presetId: 1, name: 'Wet season 1', cohort: selectSeasonalCohort({ db }), startAt: NOW, dailyCap: 10,
    });

    const after = new CampaignService({ db }).finalizeIfDone(1, new Date('2026-11-30T00:00:00Z'));
    assert.equal(after.finished, true);
  });

  it('rolls back entirely when a seasonal draft is missing', () => {
    const leadId = seedLead(db, 'partial', { styles: ['touch_3', 'touch_4'] });
    const rowId = joinCampaign(db, { campaignId: 1, leadId });
    const cohort = selectSeasonalCohort({ db });

    assert.throws(
      () => createSeasonalCampaign({ db, presetId: 1, name: 'Wet season 1', cohort, startAt: NOW, dailyCap: 10 }),
      /touch_1_wet/
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM campaigns WHERE name = 'Wet season 1'").get().c, 0);
    assert.equal(db.prepare('SELECT status FROM campaign_leads WHERE id = ?').get(rowId).status, 'queued');
  });

  it('rejects an empty cohort', () => {
    assert.throws(
      () => createSeasonalCampaign({ db, presetId: 1, name: 'Wet season 1', cohort: [], startAt: NOW, dailyCap: 10 }),
      /cohort/
    );
  });
});
