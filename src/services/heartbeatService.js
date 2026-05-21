import { WarmupCapService } from './warmupCapService.js';
import { MetricsService } from './metricsService.js';

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
         'outreach.last_send_worker_gap',
         'outreach.last_response_monitor'
       )`
    ).all().reduce((values, row) => {
      values[row.key] = row.value;
      return values;
    }, {});

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const funnel = new MetricsService({ db: this.db }).outreachFunnel({ since: sevenDaysAgo });

    const invalidCount = this.db.prepare(`
      SELECT COUNT(*) AS c FROM email_events ev
      JOIN email_sends es ON es.id = ev.send_id
      WHERE ev.type = 'cancelled'
        AND ev.raw_payload LIKE '%invalid_recipient%'
        AND ev.detected_at >= ?
    `).get(sevenDaysAgo).c;
    const queuedCount = this.db.prepare(`
      SELECT COUNT(*) AS c FROM email_sends WHERE created_at >= ?
    `).get(sevenDaysAgo).c;
    const invalidRecipientRate7d = queuedCount ? invalidCount / queuedCount : 0;

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
      bounce_rate_7d: funnel.totals.bounce_rate,
      reply_rate_7d: funnel.totals.reply_rate,
      invalid_recipient_rate_7d: invalidRecipientRate7d,
      next_send_at: nextSend?.scheduled_for || null,
      last_startup_recovery: settings['outreach.last_startup_recovery'] || null,
      last_backup_path: settings['outreach.last_backup_path'] || null,
      last_backup_at: settings['outreach.last_backup_at'] || null,
      last_healthcheck: settings['outreach.last_healthcheck'] || null,
      last_send_worker_gap: settings['outreach.last_send_worker_gap'] || null,
      last_response_monitor: settings['outreach.last_response_monitor'] || null,
    };
  }
}
