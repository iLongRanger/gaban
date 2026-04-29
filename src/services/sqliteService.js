export default class SqliteService {
  constructor({ db, logger } = {}) {
    this.db = db;
    this.logger = logger;
  }

  exportResults(leads, drafts, weekLabel) {
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

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const draft = drafts[i];

        insertLead.run(
          lead.place_id,
          lead.business_name,
          lead.type || null,
          lead.formatted_address || null,
          lead.phone || null,
          lead.website || null,
          lead.email || null,
          lead.rating ?? null,
          lead.reviews_count ?? null,
          lead.photo_count ?? null,
          lead.location?.lat ?? null,
          lead.location?.lng ?? null,
          lead.distance_km ?? null,
          lead.subtypes ? JSON.stringify(lead.subtypes) : null,
          lead.working_hours || null,
          lead.business_status || null,
          lead.reviews_data ? JSON.stringify(lead.reviews_data) : '[]',
          lead.instagram || null,
          lead.facebook || null,
          lead.total_score ?? 0,
          JSON.stringify(lead.factor_scores || {}),
          lead.reasoning || '',
          weekLabel,
          now,
          now
        );

        if (draft?.error) {
          this.logger?.warn(
            'Skipping drafts for ' + lead.business_name + ': ' + draft.error
          );
          continue;
        }

        const row = this.db.prepare('SELECT id FROM leads WHERE place_id = ?').get(lead.place_id);
        if (!row) continue;

        for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
          const d = draft[style];
          if (!d) continue;
          insertDraft.run(row.id, style, d.email_subject, d.email_body, d.dm, now, now);
        }
      }
    });

    transaction();
    this.logger?.info('Exported ' + leads.length + ' leads to SQLite.');
  }
}
