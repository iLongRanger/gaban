import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { recordOpen } from '../src/services/openTrackingService.js';
import { signOpenToken, signUnsubscribeToken } from '../src/services/unsubscribeTokenService.js';

const SECRET = 'test-secret';
const SENT_AT = '2026-08-20T10:00:00.000Z';

function seedSend(db, { sentAt = SENT_AT } = {}) {
  const now = '2026-08-20T09:00:00.000Z';
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
  const result = db.prepare(
    `INSERT INTO email_sends (campaign_lead_id, touch_number, template_style, subject, body, recipient_email, scheduled_for, created_at, sent_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`
  ).run(cl.id, 1, 'touch_1_poke', 'Hello', 'Body', 'dest@example.com', now, now, sentAt);
  return Number(result.lastInsertRowid);
}

function openEvents(db, sendId) {
  return db.prepare(
    `SELECT type, detected_at, raw_payload FROM email_events WHERE send_id = ? AND type = 'opened' ORDER BY id`
  ).all(sendId);
}

// A plausible human open: an hour after the send, from Gmail's image proxy.
function humanOpen(sendId, extra = {}) {
  return {
    token: signOpenToken(sendId, SECRET),
    secret: SECRET,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) GoogleImageProxy',
    ip: '66.249.84.1',
    now: new Date('2026-08-20T11:00:00.000Z'),
    ...extra,
  };
}

describe('recordOpen', () => {
  let db;
  beforeEach(() => { db = initDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('records an opened event against the send named in the token', () => {
    const sendId = seedSend(db);
    const result = recordOpen({ db, ...humanOpen(sendId) });

    assert.strictEqual(result.recorded, true);
    assert.strictEqual(result.sendId, sendId);
    const events = openEvents(db, sendId);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].detected_at, '2026-08-20T11:00:00.000Z');
  });

  it('stores the user agent and ip so opens can be re-filtered later', () => {
    const sendId = seedSend(db);
    recordOpen({ db, ...humanOpen(sendId) });

    const payload = JSON.parse(openEvents(db, sendId)[0].raw_payload);
    assert.match(payload.user_agent, /GoogleImageProxy/);
    assert.strictEqual(payload.ip, '66.249.84.1');
  });

  // Gmail proxies every image through its own servers, so a proxy hit is still
  // a real person opening the mail. Treating it as machine traffic would
  // discard the majority of genuine opens.
  it('does not flag a Gmail image proxy fetch as machine traffic', () => {
    const sendId = seedSend(db);
    recordOpen({ db, ...humanOpen(sendId) });

    assert.strictEqual(JSON.parse(openEvents(db, sendId)[0].raw_payload).machine, false);
  });

  it('flags an open that lands within two seconds of the send as machine traffic', () => {
    const sendId = seedSend(db);
    recordOpen({ db, ...humanOpen(sendId, { now: new Date('2026-08-20T10:00:01.000Z') }) });

    assert.strictEqual(JSON.parse(openEvents(db, sendId)[0].raw_payload).machine, true);
  });

  it('flags a known security scanner by user agent', () => {
    const sendId = seedSend(db);
    recordOpen({ db, ...humanOpen(sendId, { userAgent: 'Mozilla/5.0 (compatible; ProofpointURLDefense)' }) });

    assert.strictEqual(JSON.parse(openEvents(db, sendId)[0].raw_payload).machine, true);
  });

  it('accumulates repeat opens rather than collapsing them', () => {
    const sendId = seedSend(db);
    recordOpen({ db, ...humanOpen(sendId) });
    recordOpen({ db, ...humanOpen(sendId, { now: new Date('2026-08-20T12:00:00.000Z') }) });

    assert.strictEqual(openEvents(db, sendId).length, 2);
  });

  it('ignores a token whose send does not exist', () => {
    const result = recordOpen({ db, ...humanOpen(9999) });

    assert.strictEqual(result.recorded, false);
    assert.strictEqual(openEvents(db, 9999).length, 0);
  });

  it('ignores an unsubscribe token presented to the open endpoint', () => {
    const sendId = seedSend(db);
    const result = recordOpen({
      db, secret: SECRET, token: signUnsubscribeToken({ sendId }, SECRET),
    });

    assert.strictEqual(result.recorded, false);
    assert.strictEqual(openEvents(db, sendId).length, 0);
  });

  it('ignores a token signed with the wrong secret', () => {
    const sendId = seedSend(db);
    const result = recordOpen({ db, ...humanOpen(sendId), secret: 'other-secret' });

    assert.strictEqual(result.recorded, false);
    assert.strictEqual(openEvents(db, sendId).length, 0);
  });

  // The endpoint must serve a pixel no matter what, so a malformed token has
  // to come back as a value rather than an exception.
  it('returns a result instead of throwing on a malformed token', () => {
    const result = recordOpen({ db, token: 'garbage', secret: SECRET });
    assert.strictEqual(result.recorded, false);
  });

  // The pixel URL ends in .gif so mail clients treat it as an image; the
  // extension is part of the path segment the route receives.
  it('accepts a token carrying the .gif extension from the pixel URL', () => {
    const sendId = seedSend(db);
    const result = recordOpen({
      db, ...humanOpen(sendId), token: `${signOpenToken(sendId, SECRET)}.gif`,
    });

    assert.strictEqual(result.recorded, true);
    assert.strictEqual(openEvents(db, sendId).length, 1);
  });

  it('tolerates a missing user agent', () => {
    const sendId = seedSend(db);
    const result = recordOpen({ db, ...humanOpen(sendId), userAgent: undefined });

    assert.strictEqual(result.recorded, true);
    assert.strictEqual(JSON.parse(openEvents(db, sendId)[0].raw_payload).user_agent, null);
  });
});
