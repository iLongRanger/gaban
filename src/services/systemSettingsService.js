export class SystemSettingsService {
  constructor({ db } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  getSettings(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return {};
    const rows = this.db.prepare(
      `SELECT key, value
       FROM system_settings
       WHERE key IN (${keys.map(() => '?').join(',')})`
    ).all(...keys);

    return rows.reduce((settings, row) => {
      settings[row.key] = row.value;
      return settings;
    }, {});
  }

  setSetting(key, value) {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    ).run(key, String(value), now);
  }

  deleteSetting(key) {
    this.db.prepare('DELETE FROM system_settings WHERE key = ?').run(key);
  }

  updateSettings(values) {
    const update = this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined || value === '') {
          this.deleteSetting(key);
        } else {
          this.setSetting(key, value);
        }
      }
    });
    update();
  }
}
