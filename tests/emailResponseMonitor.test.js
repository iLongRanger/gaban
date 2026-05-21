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
  for (const style of ['touch_1', 'touch_2', 'touch_3']) {
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
     SET status = 'sent', sent_at = ?, gmail_message_id = ?, gmail_thread_id = ?, gmail_rfc_message_id = ?
     WHERE id = 1`
  ).run('2026-05-04T16:00:00.000Z', 'sent-msg-1', 'thread-1', '<sent-msg-1@mail.gmail.com>');
}

function gmailMessage({
  id = 'reply-msg-1',
  threadId = 'thread-1',
  from = 'Lead <lead@example.com>',
  subject = 'Re: Hello',
  inReplyTo,
  references,
} = {}) {
  return {
    id,
    threadId,
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        ...(inReplyTo ? [{ name: 'In-Reply-To', value: inReplyTo }] : []),
        ...(references ? [{ name: 'References', value: references }] : []),
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

  it('logs auto-replies by RFC Message-ID and keeps follow-ups scheduled by default', () => {
    seedSentCampaign(db);
    const monitor = new EmailResponseMonitor({
      db,
      gmail: {},
      senderEmail: 'outreach@gleampro.ca',
    });

    const result = monitor.processMessage(gmailMessage({
      id: 'auto-reply-msg-1',
      threadId: 'different-thread',
      subject: 'Automatic reply: Subject touch_1',
      inReplyTo: '<sent-msg-1@mail.gmail.com>',
      references: '<sent-msg-1@mail.gmail.com>',
    }), new Date('2026-05-05T16:00:00.000Z'));

    assert.strictEqual(result.status, 'auto_replied');
    const campaignLead = db.prepare('SELECT status FROM campaign_leads WHERE id = 1').get();
    assert.strictEqual(campaignLead.status, 'queued');
    const scheduled = db.prepare(`SELECT COUNT(*) AS count FROM email_sends WHERE status = 'scheduled'`).get();
    assert.strictEqual(scheduled.count, 2);
    const event = db.prepare(`SELECT type FROM email_events WHERE send_id = 1`).get();
    assert.strictEqual(event.type, 'auto_replied');
  });

  it('can cancel follow-ups for auto-replies when configured', () => {
    seedSentCampaign(db);
    const now = '2026-05-05T15:55:00.000Z';
    db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('outreach.auto_reply_action', 'cancel', ?)`
    ).run(now);
    const monitor = new EmailResponseMonitor({
      db,
      gmail: {},
      senderEmail: 'outreach@gleampro.ca',
    });

    const result = monitor.processMessage(gmailMessage({
      id: 'auto-reply-msg-1',
      threadId: 'different-thread',
      subject: 'Automatic reply: Subject touch_1',
      inReplyTo: '<sent-msg-1@mail.gmail.com>',
    }), new Date('2026-05-05T16:00:00.000Z'));

    assert.strictEqual(result.status, 'auto_replied');
    const campaignLead = db.prepare('SELECT status FROM campaign_leads WHERE id = 1').get();
    assert.strictEqual(campaignLead.status, 'auto_replied');
    const cancelled = db.prepare(`SELECT COUNT(*) AS count FROM email_sends WHERE status = 'cancelled'`).get();
    assert.strictEqual(cancelled.count, 2);
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
