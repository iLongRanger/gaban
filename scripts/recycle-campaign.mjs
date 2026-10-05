#!/usr/bin/env node
// One-off: re-engage the leads who absorbed a full sequence of retired cold copy and
// never replied. Generates two-touch re-engagement drafts, creates one campaign over the
// whole cohort, and retires each lead's previous campaign_lead row to 'recycled'.
//
// The cohort is every lead still 'active' on a campaign whose touch_styles predates the
// current four-touch copy, with nothing in flight and nothing suppressed. It deliberately
// does NOT include leads who received the current copy — their silence is only
// interpretable once open-tracking data exists for it.
//
// Usage:
//   node scripts/recycle-campaign.mjs --dry     # print the cohort and plan, no API calls, no writes
//   node scripts/recycle-campaign.mjs           # draft, then create the campaign
//   node scripts/recycle-campaign.mjs --draft-only   # generate drafts, stop before creating the campaign
//
// Options:
//   --name="..."   campaign name (default: "Recycle - retired copy YYYY-MM-DD")
//   --cap=N        campaign daily cap (default 10)
//   --start=ISO    first send time (default: now)
//
// Safe to re-run: leads that already have recycle drafts are not redrafted, so an OpenAI
// failure partway through costs only the leads it had not reached yet.

import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import DraftingService from '../src/services/draftingService.js';
import {
  RECYCLE_TOUCH_STYLES,
  selectRecycleCohort,
  ensureRecyclePreset,
  createRecycleCampaign,
} from '../src/services/recycleCampaignService.js';

const DRY = process.argv.includes('--dry');
const DRAFT_ONLY = process.argv.includes('--draft-only');
const DB_PATH = path.resolve(process.cwd(), 'data/gaban.sqlite');

function flag(name, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3).replace(/^["']|["']$/g, '') : fallback;
}

const today = new Date().toISOString().slice(0, 10);
const CAMPAIGN_NAME = flag('name', `Recycle - retired copy ${today}`);
const DAILY_CAP = Number(flag('cap', '10'));
const START_AT = flag('start', new Date().toISOString());

if (!Number.isFinite(DAILY_CAP) || DAILY_CAP < 1) {
  console.error(`--cap must be a positive number, got ${DAILY_CAP}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const cohort = selectRecycleCohort({ db });
const needDrafts = cohort.filter((row) => !row.hasRecycleDrafts);

const byCampaign = new Map();
for (const row of cohort) {
  const styles = JSON.parse(row.touchStyles).join(',');
  byCampaign.set(styles, (byCampaign.get(styles) || 0) + 1);
}

console.log(`Cohort: ${cohort.length} leads (${needDrafts.length} still need drafts).`);
for (const [styles, count] of byCampaign) console.log(`  ${count.toString().padStart(4)}  from [${styles}]`);
console.log(`Campaign: "${CAMPAIGN_NAME}", cap ${DAILY_CAP}/day, starting ${START_AT}`);
console.log(`Sends to schedule: ${cohort.length * RECYCLE_TOUCH_STYLES.length} (${RECYCLE_TOUCH_STYLES.join(' then ')}, day 0 and day 4).`);

if (cohort.length === 0) {
  console.log('Nothing to recycle. Exiting.');
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
  // Upsert: outreach_drafts is UNIQUE(lead_id, style), and a retry must be able to
  // overwrite a half-written row rather than abort on the constraint.
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
    // reviews_data is stored as JSON text; the vertical classifier and prompt expect an array.
    if (typeof lead.reviews_data === 'string') {
      try { lead.reviews_data = JSON.parse(lead.reviews_data); } catch { lead.reviews_data = []; }
    }

    const drafts = await drafter.draftRecycle(lead);
    const missing = RECYCLE_TOUCH_STYLES.filter((style) => !drafts?.[style]?.email_body);
    if (drafts?.error || missing.length > 0) {
      failed += 1;
      console.warn(`  ! ${lead.business_name} (${row.leadId}): ${drafts?.error || `missing ${missing.join(', ')}`}`);
      continue;
    }

    const now = new Date().toISOString();
    const write = db.transaction(() => {
      for (const style of RECYCLE_TOUCH_STYLES) {
        upsertDraft.run(row.leadId, style, drafts[style].email_subject, drafts[style].email_body, drafts[style].dm, now, now);
      }
    });
    write();
    drafted += 1;
    if (drafted % 10 === 0) console.log(`  drafted ${drafted}/${needDrafts.length}`);
  }

  console.log(`Drafted ${drafted} leads, ${failed} failed.`);
  if (failed > 0) {
    console.error('Some leads have no recycle copy. Re-run to retry just those, then create the campaign.');
    process.exit(1);
  }
}

if (DRAFT_ONLY) {
  console.log('Drafts written. Stopping before campaign creation (--draft-only).');
  process.exit(0);
}

// The preset's coordinates are never used for this campaign (discovery does not run from
// it), but the columns are NOT NULL, so borrow them from whichever preset is the default.
const home = db.prepare(
  'SELECT office_lat, office_lng, location FROM presets ORDER BY is_default DESC, id LIMIT 1'
).get();
if (!home) {
  console.error('No presets exist to borrow office coordinates from.');
  process.exit(1);
}
const preset = ensureRecyclePreset({
  db,
  officeLat: home.office_lat,
  officeLng: home.office_lng,
  location: home.location,
});

// Re-select so the cohort reflects the drafts just written and anything that changed
// underneath us while the API calls were in flight.
const finalCohort = selectRecycleCohort({ db });
const campaign = createRecycleCampaign({
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
console.log(`Retired ${finalCohort.length} previous campaign_lead rows to 'recycled'.`);
