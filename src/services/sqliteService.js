export default class SqliteService {
  constructor({ db, logger } = {}) {
    this.db = db;
    this.logger = logger;
  }

  exportResults(leads, drafts, weekLabel, { runId = null } = {}) {
    const now = new Date().toISOString();

    const insertLead = this.db.prepare(`
      INSERT OR IGNORE INTO leads (
        place_id, business_name, type, address, phone, website, email,
        rating, reviews_count, photo_count, latitude, longitude, distance_km,
        subtypes, working_hours, business_status, reviews_data,
        instagram, facebook, total_score, factor_scores, reasoning,
        status, week, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'new', ?, ?, ?
      )
    `);

    const insertDraft = this.db.prepare(`
      INSERT OR IGNORE INTO outreach_drafts (
        lead_id, style, email_subject, email_body, dm,
        selected, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const insertRunResult = this.db.prepare(`
      INSERT OR REPLACE INTO lead_run_results (
        run_id, lead_id, rank, week, total_score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const draft = drafts[i];
        const placeId = valueOrNull(lead.place_id) || buildFallbackPlaceId(lead);

        runStatement(insertLead, 'insert lead', [
          placeId,
          valueOrNull(lead.business_name) || 'Unknown business',
          valueOrNull(lead.type),
          valueOrNull(lead.formatted_address),
          valueOrNull(lead.phone),
          valueOrNull(lead.website),
          valueOrNull(lead.email),
          lead.rating ?? null,
          lead.reviews_count ?? null,
          lead.photo_count ?? null,
          lead.location?.lat ?? null,
          lead.location?.lng ?? null,
          lead.distance_km ?? null,
          lead.subtypes == null ? null : JSON.stringify(lead.subtypes),
          valueOrNull(lead.working_hours),
          valueOrNull(lead.business_status),
          lead.reviews_data ? JSON.stringify(lead.reviews_data) : '[]',
          valueOrNull(lead.instagram),
          valueOrNull(lead.facebook),
          lead.total_score ?? 0,
          JSON.stringify(lead.factor_scores || {}),
          valueOrNull(lead.reasoning) || '',
          weekLabel,
          now,
          now
        ]);

        if (draft?.error) {
          this.logger?.warn(
            'Skipping drafts for ' + lead.business_name + ': ' + draft.error
          );
          continue;
        }

        const row = getStatement(
          this.db.prepare('SELECT id FROM leads WHERE place_id = ?'),
          'select lead by place_id',
          [placeId]
        );
        if (!row) continue;

        if (runId) {
          runStatement(insertRunResult, 'insert run result', [
            runId,
            row.id,
            i + 1,
            weekLabel,
            lead.total_score ?? 0,
            now
          ]);
        }

        for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
          const d = draft[style];
          if (!d) continue;
          runStatement(insertDraft, 'insert outreach draft', [
            row.id,
            style,
            valueOrNull(d.email_subject) || '',
            valueOrNull(d.email_body) || '',
            valueOrNull(d.dm) || '',
            now,
            now
          ]);
        }
      }

      if (runId) {
        runStatement(
          this.db.prepare('UPDATE pipeline_runs SET leads_found = ? WHERE id = ?'),
          'update pipeline run lead count',
          [leads.length, runId]
        );
      }
    });

    transaction();
    this.logger?.info('Exported ' + leads.length + ' leads to SQLite.');
  }
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

function normalizeBindValues(values) {
  return values.map(value => {
    if (value === undefined) return null;
    if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value)) {
      return JSON.stringify(value);
    }
    return value;
  });
}

function runStatement(statement, label, values) {
  try {
    return statement.run(...normalizeBindValues(values));
  } catch (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

function getStatement(statement, label, values) {
  try {
    return statement.get(...normalizeBindValues(values));
  } catch (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

function buildFallbackPlaceId(lead) {
  const key = [
    lead.business_name,
    lead.formatted_address,
    lead.phone,
    lead.website,
    lead.location?.lat,
    lead.location?.lng
  ]
    .filter(value => value !== undefined && value !== null && value !== '')
    .map(String)
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

  return `generated:${key || 'unknown'}`;
}
