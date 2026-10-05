import { CampaignService } from './campaignService.js';
import { SuppressionService } from './suppressionService.js';

// A re-engagement sequence: own the earlier emails, then close the file. Two touches
// land at TOUCH_OFFSETS slots 1 and 2, so day 0 and day 4.
export const RECYCLE_TOUCH_STYLES = ['recycle_1', 'recycle_2'];

// Terminal status stamped on the lead's previous campaign_lead row. Recognised by
// campaignService's TERMINAL_LEAD_STATUSES so the old campaign can finalize.
export const RECYCLED_STATUS = 'recycled';

// The campaign needs a preset row, but this cohort spans fifteen of them across
// restaurants, offices, clinics and physio. A dedicated preset keeps the campaign list
// honest instead of labelling a physio recycle campaign "Restaurants near Jensen".
// Discovery never runs from it, hence the empty category list.
const RECYCLE_PRESET_NAME = 'Recycle (no discovery)';

/**
 * Leads eligible for re-engagement: still active on a campaign whose copy generation has
 * since been retired, with nothing left in flight.
 *
 * Deliberately NOT keyed on `touch_count >= 4` — half the campaigns only ever ran three
 * touches, so that test silently drops the leads who did complete their sequence.
 */
export function selectRecycleCohort({ db }) {
  const rows = db.prepare(`
    SELECT cl.id          AS campaignLeadId,
           cl.lead_id     AS leadId,
           cl.campaign_id AS campaignId,
           cl.touch_count AS touchCount,
           l.email        AS email,
           l.business_name AS businessName,
           c.touch_styles AS touchStyles,
           EXISTS (
             SELECT 1 FROM outreach_drafts od
             WHERE od.lead_id = cl.lead_id AND od.style = ?
           )              AS hasRecycleDrafts
    FROM campaign_leads cl
    JOIN campaigns c ON c.id = cl.campaign_id
    JOIN leads l     ON l.id = cl.lead_id
    WHERE cl.status = 'active'
      AND l.email IS NOT NULL
      AND TRIM(l.email) <> ''
      AND c.touch_styles NOT LIKE '%touch_4%'
      AND NOT EXISTS (
        SELECT 1 FROM email_sends es
        WHERE es.campaign_lead_id = cl.id AND es.status IN ('scheduled', 'sending')
      )
    ORDER BY cl.id
  `).all(RECYCLE_TOUCH_STYLES[0]);

  // Suppression is stored as a hash plus a domain list, so it cannot be joined in SQL.
  const suppression = new SuppressionService({ db });
  return rows
    .filter((row) => !suppression.isSuppressed(row.email))
    .map((row) => ({ ...row, hasRecycleDrafts: Boolean(row.hasRecycleDrafts) }));
}

export function ensureRecyclePreset({ db, officeLat, officeLng, location = 'Metro Vancouver' }) {
  const existing = db.prepare('SELECT * FROM presets WHERE name = ?').get(RECYCLE_PRESET_NAME);
  if (existing) return existing;

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets
    (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, '[]', 0, ?, ?)`)
    .run(RECYCLE_PRESET_NAME, location, officeLat, officeLng, now, now);
  return db.prepare('SELECT * FROM presets WHERE name = ?').get(RECYCLE_PRESET_NAME);
}

/**
 * Create the recycle campaign and retire the cohort's previous campaign_lead rows in one
 * transaction, so a missing draft can never leave a lead marked recycled with nowhere to go.
 */
export function createRecycleCampaign({ db, presetId, name, cohort, startAt, dailyCap = 10 }) {
  if (!Array.isArray(cohort) || cohort.length === 0) throw new Error('cohort is empty');

  const campaigns = new CampaignService({ db });
  const run = db.transaction(() => {
    const campaign = campaigns.createCampaign({
      presetId,
      name,
      leadIds: cohort.map((row) => row.leadId),
      startAt,
      dailyCap,
      touchStyles: RECYCLE_TOUCH_STYLES,
    });

    const now = new Date().toISOString();
    const retire = db.prepare(
      `UPDATE campaign_leads SET status = ?, completed_at = ? WHERE id = ? AND status = 'active'`
    );
    for (const row of cohort) retire.run(RECYCLED_STATUS, now, row.campaignLeadId);

    return campaign;
  });

  return run();
}

export default { selectRecycleCohort, ensureRecyclePreset, createRecycleCampaign };
