import { WarmupCapService } from './warmupCapService.js';

function hasGmailEnv(env) {
  return Boolean(
    env.GMAIL_OAUTH_CLIENT_ID &&
    env.GMAIL_OAUTH_CLIENT_SECRET &&
    env.GMAIL_OAUTH_REFRESH_TOKEN &&
    env.GMAIL_SENDER_EMAIL
  );
}

export class HeartbeatService {
  constructor({ db, env = process.env } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.env = env;
  }

  snapshot({ now = new Date() } = {}) {
    const day = now.toISOString().slice(0, 10);
    const cap = new WarmupCapService({ db: this.db }).canSend({ at: now });
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const nextSend = this.db.prepare(
      `SELECT scheduled_for
       FROM email_sends
       WHERE status = 'scheduled'
       ORDER BY scheduled_for ASC
       LIMIT 1`
    ).get();
    const settings = this.db.prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN (
         'outreach.last_startup_recovery',
         'outreach.last_backup_path',
         'outreach.last_backup_at',
         'outreach.last_healthcheck',
         'outreach.last_send_worker_gap'
       )`
    ).all().reduce((values, row) => {
      values[row.key] = row.value;
      return values;
    }, {});

    return {
      checked_at: now.toISOString(),
      gmail_configured: hasGmailEnv(this.env),
      active_campaigns: this.db.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'active'").get().count,
      paused_campaigns: this.db.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'paused'").get().count,
      scheduled_sends: this.db.prepare("SELECT COUNT(*) AS count FROM email_sends WHERE status = 'scheduled'").get().count,
      sending_stale: this.db.prepare(
        "SELECT COUNT(*) AS count FROM email_sends WHERE status = 'sending' AND COALESCE(sent_at, scheduled_for) < ?"
      ).get(oneHourAgo).count,
      sent_today: cap.count,
      daily_cap: cap.cap,
      remaining_today: cap.remaining,
      replies_waiting: this.db.prepare(
        `SELECT COUNT(*) AS count
         FROM email_events
         WHERE type = 'replied'
           AND detected_at >= ?`
      ).get(`${day}T00:00:00.000Z`).count,
      bounces_today: this.db.prepare(
        `SELECT COUNT(*) AS count
         FROM email_events
         WHERE type = 'bounced'
           AND detected_at >= ?`
      ).get(`${day}T00:00:00.000Z`).count,
      next_send_at: nextSend?.scheduled_for || null,
      last_startup_recovery: settings['outreach.last_startup_recovery'] || null,
      last_backup_path: settings['outreach.last_backup_path'] || null,
      last_backup_at: settings['outreach.last_backup_at'] || null,
      last_healthcheck: settings['outreach.last_healthcheck'] || null,
      last_send_worker_gap: settings['outreach.last_send_worker_gap'] || null,
    };
  }
}
