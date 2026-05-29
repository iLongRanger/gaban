import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';

const NOW = new Date('2026-05-20T12:00:00Z');

function setGrace(db, hours) {
  db.prepare(`INSERT INTO system_settings (key, value, updated_at)
              VALUES ('outreach.finish_grace_hours', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(String(hours), NOW.toISOString());
}

function seedCampaign(db, { status = 'active', touchStyles = '["touch_1","touch_2","touch_3"]' } = {}) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO presets (id, name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
              VALUES (1, 'P', 'V', 10, 49.2, -123.1, '["x"]', 5, ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO campaigns (id, name, preset_id, status, touch_styles, created_at, updated_at)
              VALUES (1, 'C', 1, ?, ?, ?, ?)`).run(status, touchStyles, now, now);
}

function seedLead(db, { leadId, campaignLeadId, status, touch_count = 0, last_touch_at = null }) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO leads (id, place_id, business_name, type, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
              VALUES (?, ?, 'B', 'Restaurant', 'b@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W20', ?, ?)`)
    .run(leadId, `pid-${leadId}`, now, now);
  db.prepare(`INSERT INTO campaign_leads (id, campaign_id, lead_id, status, touch_count, last_touch_at, added_at)
              VALUES (?, 1, ?, ?, ?, ?, ?)`)
    .run(campaignLeadId, leadId, status, touch_count, last_touch_at, now);
}

function seedSend(db, { id, campaignLeadId, touch_number, status }) {
  const now = NOW.toISOString();
  db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, scheduled_for, created_at)
              VALUES (?, ?, ?, ?, 's', 'b', 'b@example.com', ?, ?, ?)`)
    .run(id, campaignLeadId, touch_number, `touch_${touch_number}`, status, now, now);
}

test('does not finish when scheduled sends remain', () => {
  const db = initDb(':memory:');
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 1 });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 2, status: 'scheduled' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'sends_pending');
});

test('does not finish a silent lead still within the grace window', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-20T02:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'lead_in_progress');
});

test('finishes a silent lead past the grace window and freezes a summary', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-17T12:00:00Z' });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 3, status: 'sent' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
  const row = db.prepare('SELECT status, finished_at, summary FROM campaigns WHERE id = 1').get();
  assert.equal(row.status, 'finished');
  assert.ok(row.finished_at);
  assert.ok(JSON.parse(row.summary).totals);
});

test('finishes when all leads terminate early even though touch 3 never sent', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'bounced', touch_count: 1, last_touch_at: '2026-05-19T12:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = 1').get().status, 'finished');
});

test('does not finish when a lead is still queued', () => {
  const db = initDb(':memory:');
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'queued', touch_count: 0 });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'lead_queued');
});

test('never finishes a paused campaign', () => {
  const db = initDb(':memory:');
  seedCampaign(db, { status: 'paused' });
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'bounced', touch_count: 1 });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'not_active');
});

test('grace hours setting of 0 finishes immediately after final touch', () => {
  const db = initDb(':memory:');
  setGrace(db, 0);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: NOW.toISOString() });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
});

test('a follow_up_later lead does not pin the campaign open', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'follow_up_later', touch_count: 3, last_touch_at: '2026-05-17T12:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
});

test('a malformed grace setting falls back to the 48h default', () => {
  const db = initDb(':memory:');
  db.prepare(`INSERT INTO system_settings (key, value, updated_at)
              VALUES ('outreach.finish_grace_hours', 'not-a-number', ?)`).run(NOW.toISOString());
  seedCampaign(db);
  // last touch 3h ago: would finish if grace were mis-parsed to 0/NaN, must NOT finish under 48h default
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-20T09:00:00Z' });
  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'lead_in_progress');
});

test('returns not_found for an unknown campaign', () => {
  const db = initDb(':memory:');
  const res = new CampaignService({ db }).finalizeIfDone(999, NOW);
  assert.equal(res.finished, false);
  assert.equal(res.reason, 'not_found');
});

test('finalizeAllActive finishes every eligible active campaign', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'replied', touch_count: 1 });
  const finished = new CampaignService({ db }).finalizeAllActive(NOW);
  assert.deepEqual(finished, [1]);
});

test('last lead going terminal finishes a campaign whose other leads are past grace', () => {
  const db = initDb(':memory:');
  setGrace(db, 48);
  seedCampaign(db);
  // lead 1: silent, past grace; lead 2: just replied (terminal)
  seedLead(db, { leadId: 1, campaignLeadId: 1, status: 'active', touch_count: 3, last_touch_at: '2026-05-17T12:00:00Z' });
  seedSend(db, { id: 1, campaignLeadId: 1, touch_number: 3, status: 'sent' });
  seedLead(db, { leadId: 2, campaignLeadId: 2, status: 'replied', touch_count: 2, last_touch_at: '2026-05-19T12:00:00Z' });
  seedSend(db, { id: 2, campaignLeadId: 2, touch_number: 2, status: 'sent' });

  const res = new CampaignService({ db }).finalizeIfDone(1, NOW);
  assert.equal(res.finished, true);
});
