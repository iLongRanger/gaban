#!/usr/bin/env node
// One-off: give the leads who were never actually emailed a genuine first touch, using the
// wet-season opener. Generates drafts, creates one campaign, and retires each lead's old
// queued campaign_lead row to 'reassigned'.
//
// The cohort is every lead sitting at campaign_leads.status = 'queued' with an email, not
// suppressed, with no sent/sending/scheduled send in its history. All 22 of the current ones
// had their sends cancelled by the transient-DNS bug, so they have heard nothing from us.
//
// SEASONAL: the wet-season copy is honest roughly October through March in Metro Vancouver
// and wrong in July. Do not run this in spring without replacing the opener — see the
// seasonal_gap note in src/services/draftingService.js.
//
// Usage:
//   node scripts/seasonal-campaign.mjs --dry           # print the cohort and plan, no API calls, no writes
//   node scripts/seasonal-campaign.mjs                 # draft, then create the campaign
//   node scripts/seasonal-campaign.mjs --draft-only    # generate drafts, stop before creating the campaign
//
// Options:
//   --name="..."   campaign name (default: "Wet season - first touch YYYY-MM-DD")
//   --cap=N        campaign daily cap (default 10)
//   --start=ISO    first send time (default: now)
//   --db=path      run against a different SQLite file (default: data/gaban.sqlite). Point
//                  this at a copy to rehearse on real data without touching production:
//                  nothing sends, because the worker only reads the real database.
//
// Safe to re-run: leads that already have all four seasonal drafts are not redrafted, so an
// OpenAI failure partway through costs only the leads it had not reached yet.

import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import DraftingService from '../src/services/draftingService.js';
import {
  SEASONAL_TOUCH_STYLES,
  selectSeasonalCohort,
  ensureSeasonalPreset,
  createSeasonalCampaign,
} from '../src/services/seasonalCampaignService.js';

const DRY = process.argv.includes('--dry');
const DRAFT_ONLY = process.argv.includes('--draft-only');

function flag(name, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3).replace(/^["']|["']$/g, '') : fallback;
}

const DB_PATH = path.resolve(process.cwd(), flag('db', 'data/gaban.sqlite'));
const today = new Date().toISOString().slice(0, 10);
const CAMPAIGN_NAME = flag('name', `Wet season - first touch ${today}`);
const DAILY_CAP = Number(flag('cap', '10'));
const START_AT = flag('start', new Date().toISOString());

if (!Number.isFinite(DAILY_CAP) || DAILY_CAP < 1) {
  console.error(`--cap must be a positive number, got ${DAILY_CAP}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const cohort = selectSeasonalCohort({ db });
const needDrafts = cohort.filter((row) => !row.hasSeasonalDrafts);
const duplicates = cohort.reduce((total, row) => total + row.duplicateCampaignLeadIds.length, 0);

console.log(`Database: ${DB_PATH}`);
console.log(`Cohort: ${cohort.length} recipients never emailed (${needDrafts.length} still need drafts).`);
if (duplicates > 0) {
  console.log(`Deduped: ${duplicates} extra lead row(s) share an address with a kept recipient;`
    + ` they will be retired without being mailed.`);
}
console.log(`Campaign: "${CAMPAIGN_NAME}", cap ${DAILY_CAP}/day, starting ${START_AT}`);
console.log(`Sends to schedule: ${cohort.length * SEASONAL_TOUCH_STYLES.length}`
  + ` (${SEASONAL_TOUCH_STYLES.join(' -> ')} at 0, 4, 10 and 21 business days).`);
console.log(`Note: all touch-1 sends are scheduled for the start date; the ${DAILY_CAP}/day cap is`
  + ` applied by the worker at send time, which defers the rest.`);

if (cohort.length === 0) {
  console.log('Nothing to send a first touch to. Exiting.');
  process.exit(0);
}

if (DRY) {
  console.log('Dry run. Exiting before API calls and writes.');
  process.exit(0);
}

if (needDrafts.length > 0) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required.');
    process.exit(1);
  }

  const drafter = new DraftingService({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
  });
  // outreach_drafts is UNIQUE(lead_id, style); a retry must overwrite rather than abort.
  const upsertDraft = db.prepare(`INSERT INTO outreach_drafts
    (lead_id, style, email_subject, email_body, dm, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lead_id, style) DO UPDATE SET
      email_subject = excluded.email_subject,
      email_body    = excluded.email_body,
      dm            = excluded.dm,
      updated_at    = excluded.updated_at`);

  let drafted = 0;
  let failed = 0;
  for (const row of needDrafts) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(row.leadId);
    // reviews_data is stored as JSON text; the prompt expects an array. In practice every
    // row holds '[]' because discovery uses googleMapsSearch, which returns no review text.
    if (typeof lead.reviews_data === 'string') {
      try { lead.reviews_data = JSON.parse(lead.reviews_data); } catch { lead.reviews_data = []; }
    }

    const drafts = await drafter.draftOutreach(lead);
    const missing = SEASONAL_TOUCH_STYLES.filter((style) => !drafts?.[style]?.email_body);
    if (drafts?.error || missing.length > 0) {
      failed += 1;
      console.warn(`  ! ${lead.business_name} (${row.leadId}): ${drafts?.error || `missing ${missing.join(', ')}`}`);
      continue;
    }

    // Store every style the prompt returned, not just the four this campaign uses, so a
    // later campaign can pick a different opener arm without paying to redraft.
    const now = new Date().toISOString();
    const write = db.transaction(() => {
      for (const [style, piece] of Object.entries(drafts)) {
        if (!piece?.email_subject || !piece?.email_body) continue;
        upsertDraft.run(row.leadId, style, piece.email_subject, piece.email_body, piece.dm || '', now, now);
      }
    });
    write();
    drafted += 1;
    if (drafted % 5 === 0) console.log(`  drafted ${drafted}/${needDrafts.length}`);
  }

  console.log(`Drafted ${drafted} leads, ${failed} failed.`);
  if (failed > 0) {
    console.error('Some leads have no seasonal copy. Re-run to retry just those, then create the campaign.');
    process.exit(1);
  }
}

if (DRAFT_ONLY) {
  console.log('Drafts written. Stopping before campaign creation (--draft-only).');
  process.exit(0);
}

const preset = ensureSeasonalPreset({ db });

// Re-select so the cohort reflects the drafts just written and anything that changed
// underneath us while the API calls were in flight.
const finalCohort = selectSeasonalCohort({ db });
const campaign = createSeasonalCampaign({
  db,
  presetId: preset.id,
  name: CAMPAIGN_NAME,
  cohort: finalCohort,
  startAt: START_AT,
  dailyCap: DAILY_CAP,
});

const scheduled = db.prepare(`
  SELECT COUNT(*) AS c FROM email_sends es
  JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
  WHERE cl.campaign_id = ? AND es.status = 'scheduled'
`).get(campaign.id).c;

console.log(`Created campaign ${campaign.id} "${campaign.name}" with ${finalCohort.length} leads and ${scheduled} scheduled sends.`);
console.log(`Retired ${finalCohort.length} previous queued row(s) to 'reassigned'.`);
