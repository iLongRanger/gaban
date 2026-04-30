import { nextSendTime } from './sequenceScheduler.js';

function campaignOptions(campaign) {
  return {
    timeZone: campaign.timezone || 'America/Vancouver',
    sendWindowStart: campaign.send_window_start || '09:00',
    sendWindowEnd: campaign.send_window_end || '17:00',
    sendDays: String(campaign.send_days || 'mon,tue,wed,thu,fri').split(',').map((day) => day.trim()),
  };
}

function writeSetting(db, key, value, at) {
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), at.toISOString());
}

export class StartupRecovery {
  constructor({ db, logger = console } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.logger = logger;
  }

  recoverStaleSending({ now = new Date(), staleMinutes = 15 } = {}) {
    const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000).toISOString();
    const stale = this.db.prepare(
      `SELECT id
       FROM email_sends
       WHERE status = 'sending'
         AND COALESCE(sent_at, scheduled_for, created_at) <= ?`
    ).all(cutoff);

    const recover = this.db.transaction(() => {
      for (const send of stale) {
        this.db.prepare(
          `UPDATE email_sends
           SET status = 'failed', error_message = ?
           WHERE id = ?`
        ).run('startup recovery: stale sending state; manual review required before retry', send.id);
        this.db.prepare(
          `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
           VALUES (?, 'startup_recovered', ?, ?)`
        ).run(send.id, now.toISOString(), JSON.stringify({ previous_status: 'sending' }));
      }
    });
    recover();
    return stale.length;
  }

  rescheduleMissedSends({ now = new Date(), graceMinutes = 120, minGapMinutes = 2 } = {}) {
    const cutoff = new Date(now.getTime() - graceMinutes * 60 * 1000).toISOString();
    const missed = this.db.prepare(
      `SELECT es.id, es.scheduled_for, c.timezone, c.send_window_start, c.send_window_end, c.send_days
       FROM email_sends es
       JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE es.status = 'scheduled'
         AND c.status = 'active'
         AND es.scheduled_for <= ?
       ORDER BY es.scheduled_for ASC, es.id ASC`
    ).all(cutoff);

    let cursor = now;
    const recover = this.db.transaction(() => {
      for (const send of missed) {
        const next = nextSendTime(cursor, campaignOptions(send));
        this.db.prepare(
          `UPDATE email_sends
           SET scheduled_for = ?, error_message = ?
           WHERE id = ?`
        ).run(next.toISOString(), 'startup recovery: missed send window; rescheduled', send.id);
        this.db.prepare(
          `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
           VALUES (?, 'missed_window', ?, ?)`
        ).run(send.id, now.toISOString(), JSON.stringify({
          previous_scheduled_for: send.scheduled_for,
          rescheduled_for: next.toISOString(),
        }));
        cursor = new Date(next.getTime() + minGapMinutes * 60 * 1000);
      }
    });
    recover();
    return missed.length;
  }

  run({ now = new Date() } = {}) {
    const staleSending = this.recoverStaleSending({ now });
    const missedSends = this.rescheduleMissedSends({ now });
    writeSetting(this.db, 'outreach.last_startup_recovery', JSON.stringify({
      checked_at: now.toISOString(),
      stale_sending: staleSending,
      missed_sends: missedSends,
    }), now);
    if (staleSending || missedSends) {
      this.logger.warn?.(`Startup recovery: ${staleSending} stale sending, ${missedSends} missed sends`);
    }
    return { stale_sending: staleSending, missed_sends: missedSends };
  }
}
