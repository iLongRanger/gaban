import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { SuppressionService } from '../src/services/suppressionService.js';
import {
  RECYCLE_TOUCH_STYLES,
  RECYCLED_STATUS,
  selectRecycleCohort,
  ensureRecyclePreset,
  createRecycleCampaign,
} from '../src/services/recycleCampaignService.js';

const NOW = '2026-10-05T16:00:00.000Z';

function seedPreset(db, { id = 1, name = 'Restaurants' } = {}) {
  db.prepare(`INSERT INTO presets (id, name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
              VALUES (?, ?, 'Burnaby, BC', 10, 49.2, -123.1, '["restaurants"]', 5, ?, ?)`)
    .run(id, name, NOW, NOW);
  return db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
}

function seedCampaign(db, { id, touchStyles, status = 'active' }) {
  db.prepare(`INSERT INTO campaigns (id, name, preset_id, status, daily_cap, start_date, touch_styles, created_at, updated_at)
              VALUES (?, ?, 1, ?, 5, ?, ?, ?, ?)`)
    .run(id, `Campaign ${id}`, status, NOW, JSON.stringify(touchStyles), NOW, NOW);
}

function seedLead(db, suffix, { email = `lead${suffix}@example.com`, styles = RECYCLE_TOUCH_STYLES } = {}) {
  const result = db.prepare(`INSERT INTO leads
    (place_id, business_name, type, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, 'Restaurant', ?, 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W40', ?, ?)`)
    .run(`pid-${suffix}`, `Lead ${suffix}`, email, NOW, NOW);
  const leadId = Number(result.lastInsertRowid);
  for (const style of styles) {
    db.prepare(`INSERT INTO outreach_drafts (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadId, style, `subject ${style}`, `Body ${style}`, `DM ${style}`, NOW, NOW);
  }
  return leadId;
}

function joinCampaign(db, { campaignId, leadId, status = 'active', touchCount = 3 }) {
  const result = db.prepare(`INSERT INTO campaign_leads
    (campaign_id, lead_id, status, touch_count, added_at, last_touch_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(campaignId, leadId, status, touchCount, NOW, NOW);
  return Number(result.lastInsertRowid);
}

function seedSend(db, { campaignLeadId, status, touchNumber = 3 }) {
  db.prepare(`INSERT INTO email_sends
    (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, scheduled_for, created_at)
    VALUES (?, ?, 'touch_3', 's', 'b', 'b@example.com', ?, ?, ?)`)
    .run(campaignLeadId, touchNumber, status, NOW, NOW);
}

describe('selectRecycleCohort', () => {
  let db;
  beforeEach(() => {
    db = initDb(':memory:');
    seedPreset(db);
  });

  it('selects active leads whose campaign ran retired copy', () => {
    seedCampaign(db, { id: 1, touchStyles: ['curious_neighbor', 'value_lead', 'compliment_question'] });
    seedCampaign(db, { id: 2, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    const leadA = seedLead(db, 'a');
    const leadB = seedLead(db, 'b');
    joinCampaign(db, { campaignId: 1, leadId: leadA });
    joinCampaign(db, { campaignId: 2, leadId: leadB });

    const cohort = selectRecycleCohort({ db });
    assert.deepEqual(cohort.map((row) => row.leadId), [leadA, leadB]);
  });

  it('excludes leads whose campaign ran the current four-touch copy', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3', 'touch_4'] });
    joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'current') });

    assert.deepEqual(selectRecycleCohort({ db }), []);
  });

  it('excludes leads that are not active on their campaign', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'replied'), status: 'replied' });
    joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'queued'), status: 'queued' });
    joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'bounced'), status: 'bounced' });

    assert.deepEqual(selectRecycleCohort({ db }), []);
  });

  it('excludes leads that still have a send in flight', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    const scheduled = joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'scheduled') });
    const sending = joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'sending') });
    const done = joinCampaign(db, { campaignId: 1, leadId: seedLead(db, 'done') });
    seedSend(db, { campaignLeadId: scheduled, status: 'scheduled' });
    seedSend(db, { campaignLeadId: sending, status: 'sending' });
    seedSend(db, { campaignLeadId: done, status: 'sent' });

    const cohort = selectRecycleCohort({ db });
    assert.equal(cohort.length, 1);
    assert.equal(cohort[0].campaignLeadId, done);
  });

  it('excludes suppressed recipients', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    const kept = seedLead(db, 'kept');
    const dropped = seedLead(db, 'dropped', { email: 'gone@example.com' });
    joinCampaign(db, { campaignId: 1, leadId: kept });
    joinCampaign(db, { campaignId: 1, leadId: dropped });
    new SuppressionService({ db }).add({ email: 'gone@example.com', reason: 'unsubscribed', source: 'test' });

    const cohort = selectRecycleCohort({ db });
    assert.deepEqual(cohort.map((row) => row.leadId), [kept]);
  });

  it('excludes leads with no email address', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    const leadId = seedLead(db, 'noemail');
    db.prepare('UPDATE leads SET email = NULL WHERE id = ?').run(leadId);
    joinCampaign(db, { campaignId: 1, leadId });

    assert.deepEqual(selectRecycleCohort({ db }), []);
  });

  it('reports which leads already have recycle drafts so a rerun can skip them', () => {
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
    const drafted = seedLead(db, 'drafted', { styles: RECYCLE_TOUCH_STYLES });
    const undrafted = seedLead(db, 'undrafted', { styles: [] });
    joinCampaign(db, { campaignId: 1, leadId: drafted });
    joinCampaign(db, { campaignId: 1, leadId: undrafted });

    const cohort = selectRecycleCohort({ db });
    const byLead = new Map(cohort.map((row) => [row.leadId, row]));
    assert.equal(byLead.get(drafted).hasRecycleDrafts, true);
    assert.equal(byLead.get(undrafted).hasRecycleDrafts, false);
  });
});

describe('ensureRecyclePreset', () => {
  it('creates the preset once and reuses it afterwards', () => {
    const db = initDb(':memory:');
    const first = ensureRecyclePreset({ db, officeLat: 49.26, officeLng: -122.99 });
    const second = ensureRecyclePreset({ db, officeLat: 49.26, officeLng: -122.99 });

    assert.equal(first.id, second.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM presets').get().c, 1);
    // Nothing should ever run discovery from this preset.
    assert.equal(first.categories, '[]');
  });
});

describe('createRecycleCampaign', () => {
  let db;
  beforeEach(() => {
    db = initDb(':memory:');
    seedPreset(db);
    seedCampaign(db, { id: 1, touchStyles: ['touch_1', 'touch_2', 'touch_3'] });
  });

  it('schedules two recycle touches per lead using the recycle drafts', () => {
    const leadId = seedLead(db, 'a');
    joinCampaign(db, { campaignId: 1, leadId });
    const cohort = selectRecycleCohort({ db });

    const campaign = createRecycleCampaign({
      db,
      presetId: 1,
      name: 'Recycle 1',
      cohort,
      startAt: NOW,
      dailyCap: 10,
    });

    assert.equal(campaign.status, 'active');
    assert.deepEqual(campaign.touch_styles, RECYCLE_TOUCH_STYLES);
    const sends = db.prepare(`
      SELECT es.touch_number, es.template_style, es.subject
      FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? ORDER BY es.touch_number
    `).all(campaign.id);
    assert.deepEqual(sends.map((s) => s.template_style), RECYCLE_TOUCH_STYLES);
    // The cold opener A/B arm must not leak into a re-engagement sequence.
    assert.equal(sends[0].subject, 'subject recycle_1');
  });

  it('marks the previous campaign_lead row recycled so the old campaign can finalize', () => {
    const leadId = seedLead(db, 'a');
    const oldRowId = joinCampaign(db, { campaignId: 1, leadId });
    const cohort = selectRecycleCohort({ db });

    createRecycleCampaign({ db, presetId: 1, name: 'Recycle 1', cohort, startAt: NOW, dailyCap: 10 });

    const oldRow = db.prepare('SELECT status, completed_at FROM campaign_leads WHERE id = ?').get(oldRowId);
    assert.equal(oldRow.status, RECYCLED_STATUS);
    assert.ok(oldRow.completed_at);
  });

  it('leaves the old row and the new campaign untouched when a draft is missing', () => {
    const leadId = seedLead(db, 'nodrafts', { styles: [] });
    const oldRowId = joinCampaign(db, { campaignId: 1, leadId });
    const cohort = selectRecycleCohort({ db });

    assert.throws(
      () => createRecycleCampaign({ db, presetId: 1, name: 'Recycle 1', cohort, startAt: NOW, dailyCap: 10 }),
      /recycle_1/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM campaigns WHERE name = ?').get('Recycle 1').c, 0);
    assert.equal(db.prepare('SELECT status FROM campaign_leads WHERE id = ?').get(oldRowId).status, 'active');
  });

  it('rejects an empty cohort rather than creating a campaign with no leads', () => {
    assert.throws(
      () => createRecycleCampaign({ db, presetId: 1, name: 'Recycle 1', cohort: [], startAt: NOW, dailyCap: 10 }),
      /cohort/
    );
  });
});
