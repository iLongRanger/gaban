#!/usr/bin/env node
// One-off: re-run the new drafting prompt against all active campaign leads
// and reseed any still-scheduled email_sends with the new copy.
//
// NOTE: Do not run after the 2026-05-27 cold-email prompt rewrite without
// explicit operator approval. The new prompt is intentionally applied to
// new campaigns only; existing email_sends rows retain their original bodies.
//
// Usage:
//   node scripts/redraft-active.mjs           # do it
//   node scripts/redraft-active.mjs --dry     # print plan, no writes, no API calls

import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import DraftingService from '../src/services/draftingService.js';

const DRY = process.argv.includes('--dry');
const DB_PATH = path.resolve(process.cwd(), 'data/gaban.sqlite');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const leads = db.prepare(`
  SELECT DISTINCT l.*
  FROM leads l
  JOIN campaign_leads cl ON cl.lead_id = l.id
  JOIN campaigns c       ON c.id       = cl.campaign_id
  WHERE c.status = 'active'
    AND cl.status IN ('queued', 'active')
`).all();

const scheduledCount = db.prepare(`
  SELECT COUNT(*) AS c
  FROM email_sends es
  JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
  JOIN campaigns c       ON c.id  = cl.campaign_id
  WHERE c.status = 'active'
    AND cl.status IN ('queued', 'active')
    AND es.status = 'scheduled'
`).get().c;

console.log(`Plan: redraft ${leads.length} active leads, reseed ${scheduledCount} scheduled sends.`);
if (DRY) {
  console.log('Dry run. Exiting before API calls and writes.');
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY required.');
  process.exit(1);
}

const drafter = new DraftingService({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5-mini',
});

const now = new Date().toISOString();

const insertDraft = db.prepare(`
  INSERT INTO outreach_drafts (lead_id, style, email_subject, email_body, dm, selected, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  ON CONFLICT(lead_id, style) DO UPDATE SET
    email_subject = excluded.email_subject,
    email_body    = excluded.email_body,
    dm            = excluded.dm,
    updated_at    = excluded.updated_at
`);

const reseedSend = db.prepare(`
  UPDATE email_sends
  SET subject = ?, body = ?, template_style = ?
  WHERE id = ?
`);

const findScheduledSends = db.prepare(`
  SELECT es.id, es.touch_number
  FROM email_sends es
  JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
  JOIN campaigns c       ON c.id  = cl.campaign_id
  WHERE c.status = 'active'
    AND cl.status IN ('queued', 'active')
    AND cl.lead_id = ?
    AND es.status = 'scheduled'
`);

let ok = 0;
let failed = 0;
let sendsUpdated = 0;

for (const lead of leads) {
  const reviewsData = safeParseReviews(lead.reviews_data);
  const draftLead = {
    business_name: lead.business_name,
    type: lead.type,
    formatted_address: lead.address,
    rating: lead.rating,
    reviews_count: lead.reviews_count,
    reviews_data: reviewsData,
    reasoning: lead.reasoning,
  };

  process.stdout.write(`[${ok + failed + 1}/${leads.length}] ${lead.business_name} ... `);
  const drafts = await drafter.draftOutreach(draftLead);
  if (drafts.error) {
    console.log(`FAIL (${drafts.error})`);
    failed += 1;
    continue;
  }

  const txn = db.transaction(() => {
    for (const key of ['touch_1', 'touch_2', 'touch_3']) {
      const d = drafts[key];
      if (!d) continue;
      insertDraft.run(lead.id, key, d.email_subject, d.email_body, d.dm, now, now);
    }
    for (const send of findScheduledSends.all(lead.id)) {
      const key = `touch_${send.touch_number}`;
      const d = drafts[key];
      if (!d) continue;
      reseedSend.run(d.email_subject, d.email_body, key, send.id);
      sendsUpdated += 1;
    }
  });
  txn();

  ok += 1;
  console.log('ok');
}

console.log(`\nDone. Redrafted: ${ok}, failed: ${failed}, scheduled sends reseeded: ${sendsUpdated}.`);

function safeParseReviews(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}
