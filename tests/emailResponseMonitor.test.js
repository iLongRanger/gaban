import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { CampaignService } from '../src/services/campaignService.js';
import { EmailResponseMonitor } from '../src/services/emailResponseMonitor.js';

function seedSentCampaign(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Offices', 'New Westminster', 10, 49.2, -123.1, '["offices"]', 5, now, now);
  const preset = db.prepare('SELECT * FROM presets').get();
  const leadResult = db.prepare(`INSERT INTO leads
    (place_id, business_name, email, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid-a', 'Lead A', 'lead@example.com', 49.2, -123.1, 2, 90, '{}', 'good', 'new', '2026-W18', now, now);
  const leadId = Number(leadResult.lastInsertRowid);
  for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
    db.prepare(`INSERT INTO outreach_drafts
      (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leadId, style, `Subject ${style}`, `Body ${style}`, `DM ${style}`, now, now);
  }

  new CampaignService({ db }).createCampaign({
    presetId: preset.id,
    name: 'Office Week',
    leadIds: [leadId],
    startAt: '2026-05-04T16:00:00.000Z',
  });
  db.prepare(
    `UPDATE email_sends
     SET status = 'sent', sent_at = ?, gmail_message_id = ?, gmail_thread_id = ?
     WHERE id = 1`
  ).run('2026-05-04T16:00:00.000Z', 'sent-msg-1', 'thread-1');
}

function gmailMessage({ id = 'reply-msg-1', threadId = 'thread-1', from = 'Lead <lead@example.com>', subject = 'Re: Hello' } = {}) {
  return {
    id,
    threadId,
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
      ],
    },
  };
}

describe('EmailResponseMonitor', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('marks a campaign lead replied and cancels future sends', () => {
    seedSentCampaign(db);
    const monitor = new EmailResponseMonitor({
      db,
      gmail: {},
      senderEmail: 'outreach@gleampro.ca',
    });

    const result = monitor.processMessage(gmailMessage(), new Date('2026-05-05T16:00:00.000Z'));

    assert.strictEqual(result.status, 'replied');
    const campaignLead = db.prepare('SELECT status FROM campaign_leads WHERE id = 1').get();
    assert.strictEqual(campaignLead.status, 'replied');
    const cancelled = db.prepare(`SELECT COUNT(*) AS count FROM email_sends WHERE status = 'cancelled'`).get();
    assert.strictEqual(cancelled.count, 2);
    const event = db.prepare(`SELECT type FROM email_events WHERE send_id = 1`).get();
    assert.strictEqual(event.type, 'replied');
  });

  it('marks bounces separately', () => {
    seedSentCampaign(db);
    const monitor = new EmailResponseMonitor({
      db,
      gmail: {},
      senderEmail: 'outreach@gleampro.ca',
    });

    const result = monitor.processMessage(gmailMessage({
      from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      subject: 'Delivery Status Notification (Failure)',
    }), new Date('2026-05-05T16:00:00.000Z'));

    assert.strictEqual(result.status, 'bounced');
    const campaignLead = db.prepare('SELECT status FROM campaign_leads WHERE id = 1').get();
    assert.strictEqual(campaignLead.status, 'bounced');
  });

  it('polls Gmail metadata and skips already processed messages', async () => {
    seedSentCampaign(db);
    const calls = [];
    const gmail = {
      listMessages: async () => [{ id: 'reply-msg-1' }],
      getMessage: async (args) => {
        calls.push(args);
        return gmailMessage();
      },
    };
    const monitor = new EmailResponseMonitor({ db, gmail, senderEmail: 'outreach@gleampro.ca' });

    const first = await monitor.poll({ now: new Date('2026-05-05T16:00:00.000Z') });
    const second = await monitor.poll({ now: new Date('2026-05-05T16:01:00.000Z') });

    assert.strictEqual(first[0].status, 'replied');
    assert.strictEqual(second[0].status, 'skipped');
    assert.strictEqual(calls[0].format, 'metadata');
  });
});
