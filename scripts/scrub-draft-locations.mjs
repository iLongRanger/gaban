#!/usr/bin/env node
// One-off remediation: scrub sender-location/proximity claims out of stored outreach_drafts
// using the same guard the live drafting pipeline now applies (stripSenderLocationClaims).
// These drafts were generated before the prompt fix and could resurface if a future campaign
// reused them. Strips only offending sentences; leaves the rest of each draft intact.
//
// Usage:
//   node scripts/scrub-draft-locations.mjs           # dry run: report what would change
//   node scripts/scrub-draft-locations.mjs --apply   # write the cleaned drafts

import path from 'node:path';
import Database from 'better-sqlite3';
import { stripSenderLocationClaims } from '../src/services/draftingService.js';

const APPLY = process.argv.includes('--apply');
const DB_PATH = path.resolve(process.cwd(), 'data/gaban.sqlite');

const db = new Database(DB_PATH);
const rows = db.prepare('SELECT id, lead_id, style, email_body, dm FROM outreach_drafts').all();

const changes = [];
for (const row of rows) {
  const newBody = stripSenderLocationClaims(row.email_body || '');
  const newDm = stripSenderLocationClaims(row.dm || '');
  if (newBody !== (row.email_body || '') || newDm !== (row.dm || '')) {
    changes.push({ row, newBody, newDm });
  }
}

console.log(`Scanned ${rows.length} drafts. ${changes.length} need scrubbing.\n`);
for (const { row, newBody } of changes.slice(0, 20)) {
  console.log(`#${row.id} lead ${row.lead_id} [${row.style}]`);
  console.log(`  before: ${(row.email_body || '').slice(0, 160)}`);
  console.log(`  after : ${newBody.slice(0, 160)}\n`);
}
if (changes.length > 20) console.log(`…and ${changes.length - 20} more.\n`);

if (!APPLY) {
  console.log('Dry run only. Re-run with --apply to write these changes.');
  db.close();
  process.exit(0);
}

const now = new Date().toISOString();
const update = db.prepare('UPDATE outreach_drafts SET email_body = ?, dm = ?, updated_at = ? WHERE id = ?');
const applyAll = db.transaction(() => {
  for (const { row, newBody, newDm } of changes) update.run(newBody, newDm, now, row.id);
});
applyAll();
console.log(`Applied: scrubbed ${changes.length} drafts.`);
db.close();
