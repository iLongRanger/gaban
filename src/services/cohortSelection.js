// Shared by the recycle and seasonal campaign services. Both carry a known set of existing
// campaign_leads rows into a new campaign with different copy, so both need the same two
// things: one recipient per inbox, and a preset to hang the campaign off.

/**
 * Collapse rows that share an inbox down to one recipient.
 *
 * The lead set holds duplicate listings of the same business (two Cockney Kings rows, two
 * LifeLabs facilities, three storefronts on one Trattoria address) and they share an email
 * address. Two copies of the same email landing in one inbox on one day reads worse than
 * sending nothing, so one row speaks for the address: the one with the longest touch
 * history, oldest row first on a tie. The rest ride along as duplicateCampaignLeadIds and
 * are retired without being mailed.
 *
 * Rows must carry `email`, `touchCount` and `campaignLeadId`.
 */
export function dedupeByEmail(rows) {
  const byAddress = new Map();
  for (const row of rows) {
    const key = String(row.email).trim().toLowerCase();
    const group = byAddress.get(key);
    if (group) group.push(row);
    else byAddress.set(key, [row]);
  }

  const cohort = [];
  for (const group of byAddress.values()) {
    const [keeper, ...duplicates] = group.sort(
      (a, b) => (b.touchCount - a.touchCount) || (a.campaignLeadId - b.campaignLeadId)
    );
    cohort.push({
      ...keeper,
      duplicateCampaignLeadIds: duplicates.map((row) => row.campaignLeadId),
    });
  }

  return cohort.sort((a, b) => a.campaignLeadId - b.campaignLeadId);
}

/**
 * Find or create a preset that exists only to hang a campaign off.
 *
 * These cohorts span a dozen real presets across restaurants, offices, clinics and physio,
 * and a campaign takes exactly one. A dedicated preset keeps the campaign list honest
 * instead of labelling a physio campaign "Restaurants near Jensen". Discovery never runs
 * from it, hence the empty category list and zero radius. Coordinates are borrowed from
 * the default preset because the columns are NOT NULL, not because they mean anything here.
 */
export function ensureUtilityPreset({ db, name }) {
  const existing = db.prepare('SELECT * FROM presets WHERE name = ?').get(name);
  if (existing) return existing;

  const home = db.prepare(
    'SELECT office_lat, office_lng, location FROM presets ORDER BY is_default DESC, id LIMIT 1'
  ).get();
  if (!home) throw new Error('no preset exists to borrow office coordinates from');

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO presets
    (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, '[]', 0, ?, ?)`)
    .run(name, home.location, home.office_lat, home.office_lng, now, now);
  return db.prepare('SELECT * FROM presets WHERE name = ?').get(name);
}

/**
 * Move a cohort's previous campaign_lead rows to a terminal status, duplicates included.
 *
 * Siblings sharing an address are not mailed, but they still have to leave their old status
 * or they pin their campaign open and a later run picks the duplicate up again.
 */
export function retirePreviousRows({ db, cohort, status, fromStatus, at = new Date().toISOString() }) {
  const retire = db.prepare(
    'UPDATE campaign_leads SET status = ?, completed_at = ? WHERE id = ? AND status = ?'
  );
  let changed = 0;
  for (const row of cohort) {
    changed += retire.run(status, at, row.campaignLeadId, fromStatus).changes;
    for (const duplicateId of row.duplicateCampaignLeadIds || []) {
      changed += retire.run(status, at, duplicateId, fromStatus).changes;
    }
  }
  return changed;
}

export default { dedupeByEmail, ensureUtilityPreset, retirePreviousRows };
