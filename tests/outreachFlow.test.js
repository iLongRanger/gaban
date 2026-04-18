import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';
import { GmailService } from '../src/services/gmailService.js';
import { SuppressionService } from '../src/services/suppressionService.js';
import { verifyUnsubscribeToken } from '../src/services/unsubscribeTokenService.js';

const CONFIG = {
  legalName: 'Gleam & Lift Solutions',
  operatingName: 'GleamPro Cleaning',
  mailingAddress: 'Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8',
  publicAppUrl: 'https://outreach.gleampro.ca',
  tokenSecret: 'integration-test-secret',
};

function seedCampaignLead(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('p', 'Van', 30, 49.2, -123.1, '[]', 4, now, now);
  const preset = db.prepare('SELECT id FROM presets').get();
  db.prepare(`INSERT INTO leads (place_id, business_name, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('pid1', 'Test Biz', 49.2, -123.1, 5, 80, '{}', 'ok', 'new', '2026-W16', now, now);
  const lead = db.prepare('SELECT id FROM leads').get();
  db.prepare(`INSERT INTO campaigns (name, preset_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run('Campaign 1', preset.id, now, now);
  const campaign = db.prepare('SELECT id FROM campaigns').get();
  db.prepare(`INSERT INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (?, ?, ?)`)
    .run(campaign.id, lead.id, now);
  const cl = db.prepare('SELECT id FROM campaign_leads').get();
  return { campaignLeadId: cl.id };
}

function makeFakeGmailClient() {
  return {
    users: {
      messages: {
        send: async () => ({ data: { id: 'mock-msg-id', threadId: 'mock-thread-id' } }),
      },
    },
  };
}

describe('Outreach end-to-end flow', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('composes, sends, records, and processes unsubscribe', async () => {
    const { campaignLeadId } = seedCampaignLead(db);
    const now = new Date().toISOString();

    // Create pending send row (so we have an id for token signing)
    const sendResult = db.prepare(
      `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(campaignLeadId, 1, 'curious_neighbor', 'Hello', 'Initial body', 'dest@example.com', now, now);
    const sendId = Number(sendResult.lastInsertRowid);

    // Compose email with CASL footer + unsubscribe token
    const composed = buildOutreachEmail({
      sendId,
      subject: 'Hello',
      body: 'Initial body',
      config: CONFIG,
    });

    // Send via Gmail (mocked)
    const gmail = new GmailService({
      client: makeFakeGmailClient(),
      sender: { email: 'outreach@outreach.gleampro.ca', name: 'GleamPro' },
    });
    const gmailResult = await gmail.send({
      to: 'dest@example.com',
      subject: composed.subject,
      body: composed.body,
    });

    // Persist send result
    db.prepare(
      `UPDATE email_sends SET gmail_message_id = ?, gmail_thread_id = ?, sent_at = ?, status = 'sent' WHERE id = ?`
    ).run(gmailResult.gmail_message_id, gmailResult.gmail_thread_id, now, sendId);

    // Schedule a follow-up (to prove cancellation later)
    db.prepare(
      `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
    ).run(campaignLeadId, 2, 'value_lead', 'Follow', 'FU body', 'dest@example.com', now, now);

    // Extract token from composed body
    const match = composed.body.match(/\/u\/([^\s)]+)/);
    assert.ok(match);
    const token = match[1];

    // Simulate click: verify token, look up send, suppress, cancel follow-ups
    const payload = verifyUnsubscribeToken(token, CONFIG.tokenSecret);
    assert.strictEqual(payload.sendId, sendId);

    const row = db.prepare('SELECT recipient_email, campaign_lead_id FROM email_sends WHERE id = ?').get(payload.sendId);
    const suppression = new SuppressionService({ db });
    suppression.add({ email: row.recipient_email, reason: 'unsubscribed', source: 'click' });

    db.prepare(
      `UPDATE campaign_leads SET status = 'unsubscribed', completed_at = ? WHERE id = ?`
    ).run(now, row.campaign_lead_id);
    db.prepare(
      `UPDATE email_sends SET status = 'cancelled' WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(row.campaign_lead_id);

    // Assertions
    assert.strictEqual(suppression.isSuppressed('dest@example.com'), true);
    const cl = db.prepare('SELECT status FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    assert.strictEqual(cl.status, 'unsubscribed');
    const fu = db.prepare(`SELECT status FROM email_sends WHERE touch_number = 2`).get();
    assert.strictEqual(fu.status, 'cancelled');
  });

  it('rejects invalid unsubscribe tokens', () => {
    assert.throws(() => verifyUnsubscribeToken('garbage', CONFIG.tokenSecret), /malformed/i);
  });
});
