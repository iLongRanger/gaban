function isoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row?.value;
}

export class WarmupCapService {
  constructor({ db, defaultDailyCap = 5 } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.defaultDailyCap = defaultDailyCap;
  }

  getDailyCap({ campaign, at = new Date() } = {}) {
    const override = readSetting(this.db, 'outreach.daily_cap');
    if (override) return Number(override);

    const ladder = readSetting(this.db, 'outreach.warmup_ladder');
    const startDate = readSetting(this.db, 'outreach.warmup_start_date');
    if (ladder && startDate) {
      const caps = JSON.parse(ladder);
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const current = new Date(`${isoDay(at)}T00:00:00.000Z`);
      const week = Math.max(0, Math.floor((current - start) / (7 * 24 * 60 * 60 * 1000)));
      return Number(caps[Math.min(week, caps.length - 1)]);
    }

    return Number(campaign?.daily_cap ?? this.defaultDailyCap);
  }

  sentCountForDay({ at = new Date() } = {}) {
    const day = isoDay(at);
    const row = this.db.prepare(
      `SELECT COUNT(*) AS count
       FROM email_sends
       WHERE status IN ('sent', 'sending')
         AND COALESCE(sent_at, scheduled_for) >= ?
         AND COALESCE(sent_at, scheduled_for) < ?`
    ).get(`${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`);
    return Number(row?.count || 0);
  }

  canSend({ campaign, at = new Date() } = {}) {
    const cap = this.getDailyCap({ campaign, at });
    const count = this.sentCountForDay({ at });
    return {
      allowed: count < cap,
      cap,
      count,
      remaining: Math.max(0, cap - count),
    };
  }
}
