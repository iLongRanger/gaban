import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';
import { OutcomeService } from '../src/services/outcomeService.js';

function seedCampaignLead(db) {
  const now = '2026-05-04T16:00:00.000Z';
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'New Westminster', 10, 49.2, -123.1, '["offices"]', 5, now, now);
  const leadResult = db.prepare(`INSERT INTO leads
    (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid-1', 'Lead', 'lead@example.com', 49.2, -123.1, 2, 80, '{}', 'ok', 'new', '2026-W18', now, now);
  for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
    db.prepare(`INSERT INTO outreach_drafts
      (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadResult.lastInsertRowid, style, `Subject ${style}`, `Body ${style}`, `DM ${style}`, now, now);
  }
  new CampaignService({ db }).createCampaign({
    presetId: 1,
    name: 'Campaign',
    leadIds: [Number(leadResult.lastInsertRowid)],
    startAt: now,
  });
  return db.prepare('SELECT id FROM campaign_leads LIMIT 1').get().id;
}

describe('OutcomeService', () => {
  let db;
  let campaignLeadId;
  let service;

  beforeEach(() => {
    db = initDb(':memory:');
    campaignLeadId = seedCampaignLead(db);
    service = new OutcomeService({ db });
  });

  it('logs a meeting and cancels future sends', () => {
    const meeting = service.logMeeting({
      campaignLeadId,
      scheduledFor: '2026-05-06T17:00:00.000Z',
      kind: 'site_visit',
      notes: 'Asked for walkthrough.',
      at: new Date('2026-05-05T16:00:00.000Z'),
    });

    assert.strictEqual(meeting.kind, 'site_visit');
    const lead = db.prepare('SELECT status, outcome FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    assert.deepStrictEqual(lead, { status: 'meeting_booked', outcome: 'meeting_booked' });
    const scheduled = db.prepare("SELECT COUNT(*) AS count FROM email_sends WHERE status = 'scheduled'").get();
    assert.strictEqual(scheduled.count, 0);
  });

  it('logs a contract', () => {
    const contract = service.logContract({
      campaignLeadId,
      signedDate: '2026-05-07',
      valueMonthly: 1200,
      at: new Date('2026-05-07T18:00:00.000Z'),
    });

    assert.strictEqual(contract.value_monthly, 1200);
    const lead = db.prepare('SELECT status, outcome FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    assert.deepStrictEqual(lead, { status: 'contract_signed', outcome: 'contract_signed' });
  });

  it('logs dispositions and notes', () => {
    const lead = service.logDisposition({
      campaignLeadId,
      outcome: 'not_interested',
      notes: 'Already has a cleaner.',
      at: new Date('2026-05-05T16:00:00.000Z'),
    });

    assert.strictEqual(lead.outcome, 'not_interested');
    const note = db.prepare('SELECT content FROM lead_notes').get();
    assert.strictEqual(note.content, 'Already has a cleaner.');
  });
});
