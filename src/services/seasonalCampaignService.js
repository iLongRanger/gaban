import { CampaignService } from './campaignService.js';
import { SuppressionService } from './suppressionService.js';
import { dedupeByEmail, ensureUtilityPreset, retirePreviousRows } from './cohortSelection.js';

// The wet-season sequence. Slots 0 and 1 name the seasonal arms, which campaignService uses
// verbatim; slots 2 and 3 are the shared give-first and breakup touches. SEASONAL — see the
// seasonal_gap note in draftingService for the window this copy is honest in.
export const SEASONAL_TOUCH_STYLES = ['touch_1_wet', 'touch_2_wet', 'touch_3', 'touch_4'];

// Terminal status for the lead's previous campaign_lead row. These leads were never
// contacted, so 'recycled' would misdescribe what happened to them: nothing did.
export const REASSIGNED_STATUS = 'reassigned';

const SEASONAL_PRESET_NAME = 'Seasonal (no discovery)';

/**
 * Leads owed a genuine first touch: queued on a campaign, never actually emailed.
 *
 * All 22 of these had their sends cancelled by the transient-DNS bug, so they sit at
 * 'queued' with nothing but cancelled rows behind them. A lead with a real send in its
 * history is excluded even if its row still says queued — it has already heard from us,
 * and a first-contact sequence would be the wrong copy.
 */
export function selectSeasonalCohort({ db }) {
  const rows = db.prepare(`
    SELECT cl.id          AS campaignLeadId,
           cl.lead_id     AS leadId,
           cl.campaign_id AS campaignId,
           cl.touch_count AS touchCount,
           l.email        AS email,
           l.business_name AS businessName,
           (
             SELECT COUNT(*) FROM outreach_drafts od
             WHERE od.lead_id = cl.lead_id AND od.style IN (${SEASONAL_TOUCH_STYLES.map(() => '?').join(', ')})
           )              AS seasonalDraftCount
    FROM campaign_leads cl
    JOIN leads l ON l.id = cl.lead_id
    WHERE cl.status = 'queued'
      AND l.email IS NOT NULL
      AND TRIM(l.email) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM email_sends es
        WHERE es.campaign_lead_id = cl.id
          AND es.status IN ('sent', 'sending', 'scheduled')
      )
    ORDER BY cl.id
  `).all(...SEASONAL_TOUCH_STYLES);

  // Suppression is stored as a hash plus a domain list, so it cannot be joined in SQL.
  const suppression = new SuppressionService({ db });
  const eligible = rows
    .filter((row) => !suppression.isSuppressed(row.email))
    .map(({ seasonalDraftCount, ...row }) => ({
      ...row,
      hasSeasonalDrafts: seasonalDraftCount === SEASONAL_TOUCH_STYLES.length,
    }));

  return dedupeByEmail(eligible);
}

export function ensureSeasonalPreset({ db }) {
  return ensureUtilityPreset({ db, name: SEASONAL_PRESET_NAME });
}

/**
 * Create the seasonal campaign and retire the cohort's queued rows in one transaction, so a
 * missing draft can never leave a lead marked reassigned with nowhere to go.
 */
export function createSeasonalCampaign({ db, presetId, name, cohort, startAt, dailyCap = 10 }) {
  if (!Array.isArray(cohort) || cohort.length === 0) throw new Error('cohort is empty');

  const campaigns = new CampaignService({ db });
  const run = db.transaction(() => {
    const campaign = campaigns.createCampaign({
      presetId,
      name,
      leadIds: cohort.map((row) => row.leadId),
      startAt,
      dailyCap,
      touchStyles: SEASONAL_TOUCH_STYLES,
    });

    retirePreviousRows({
      db,
      cohort,
      status: REASSIGNED_STATUS,
      fromStatus: 'queued',
    });

    return campaign;
  });

  return run();
}

export default { selectSeasonalCohort, ensureSeasonalPreset, createSeasonalCampaign };
