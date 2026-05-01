import { buildOutreachEmail } from './emailTemplateService.js';
import { SuppressionService } from './suppressionService.js';
import { nextSendTime } from './sequenceScheduler.js';
import { StartupRecovery } from './startupRecovery.js';
import { UsageService } from './usageService.js';
import { WarmupCapService } from './warmupCapService.js';

function requireConfig(env) {
  const config = {
    legalName: env.BUSINESS_LEGAL_NAME,
    operatingName: env.BUSINESS_OPERATING_NAME,
    mailingAddress: env.BUSINESS_MAILING_ADDRESS,
    publicAppUrl: env.PUBLIC_APP_URL,
    tokenSecret: env.UNSUBSCRIBE_TOKEN_SECRET,
  };
  for (const [key, value] of Object.entries(config)) {
    if (!value) throw new Error(`${key} is required`);
  }
  return config;
}

function campaignOptions(campaign) {
  return {
    timeZone: campaign.timezone,
    sendWindowStart: campaign.send_window_start,
    sendWindowEnd: campaign.send_window_end,
    sendDays: campaign.send_days.split(',').map((day) => day.trim()),
  };
}

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row?.value;
}

function writeSetting(db, key, value, at) {
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), at.toISOString());
}

export class SendQueueWorker {
  constructor({ db, mailer, env = process.env, capService, suppressionService, logger = console }) {
    if (!db) throw new Error('db required');
    if (!mailer) throw new Error('mailer required');
    this.db = db;
    this.mailer = mailer;
    this.env = env;
    this.capService = capService || new WarmupCapService({ db });
    this.suppressionService = suppressionService || new SuppressionService({ db });
    this.usage = new UsageService({ db });
    this.logger = logger;
  }

  dueSends({ now = new Date(), limit = 1 } = {}) {
    return this.db.prepare(
      `SELECT es.*, cl.status AS campaign_lead_status, c.status AS campaign_status,
              c.daily_cap, c.timezone, c.send_window_start, c.send_window_end, c.send_days
       FROM email_sends es
       JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE es.status = 'scheduled'
         AND es.scheduled_for <= ?
       ORDER BY es.scheduled_for ASC, es.id ASC
       LIMIT ?`
    ).all(now.toISOString(), limit);
  }

  deferForCap(send, now) {
    const next = nextSendTime(new Date(now.getTime() + 24 * 60 * 60 * 1000), campaignOptions(send));
    this.db.prepare(
      `UPDATE email_sends
       SET scheduled_for = ?, error_message = ?
       WHERE id = ?`
    ).run(next.toISOString(), 'deferred: warm-up cap reached', send.id);
    this.db.prepare(
      `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
       VALUES (?, 'deferred', ?, ?)`
    ).run(send.id, now.toISOString(), JSON.stringify({ reason: 'warmup_cap' }));
  }

  cancel(send, reason, now) {
    this.db.prepare(
      `UPDATE email_sends SET status = 'cancelled', error_message = ? WHERE id = ?`
    ).run(reason, send.id);
    this.db.prepare(
      `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
       VALUES (?, 'cancelled', ?, ?)`
    ).run(send.id, now.toISOString(), JSON.stringify({ reason }));
  }

  async processSend(send, now) {
    if (send.campaign_status !== 'active') {
      return { id: send.id, status: 'skipped', reason: 'campaign not active' };
    }
    if (!['queued', 'active'].includes(send.campaign_lead_status)) {
      this.cancel(send, `campaign lead ${send.campaign_lead_status}`, now);
      return { id: send.id, status: 'cancelled' };
    }
    if (this.suppressionService.isSuppressed(send.recipient_email)) {
      this.cancel(send, 'recipient suppressed', now);
      return { id: send.id, status: 'cancelled' };
    }

    const cap = this.capService.canSend({ campaign: send, at: now });
    if (!cap.allowed) {
      this.deferForCap(send, now);
      return { id: send.id, status: 'deferred' };
    }

    const claimed = this.db.prepare(
      `UPDATE email_sends SET status = 'sending' WHERE id = ? AND status = 'scheduled'`
    ).run(send.id);
    if (claimed.changes === 0) {
      return { id: send.id, status: 'skipped', reason: 'already claimed' };
    }

    try {
      const composed = buildOutreachEmail({
        sendId: send.id,
        subject: send.subject,
        body: send.body,
        config: requireConfig(this.env),
      });
      const result = await this.mailer.send({
        to: send.recipient_email,
        subject: composed.subject,
        body: composed.body,
      });
      const sentAt = new Date().toISOString();
      this.db.prepare(
        `UPDATE email_sends
         SET status = 'sent', sent_at = ?, gmail_message_id = ?, gmail_thread_id = ?, error_message = NULL
         WHERE id = ?`
      ).run(sentAt, result.gmail_message_id || result.provider || null, result.gmail_thread_id || null, send.id);
      this.db.prepare(
        `UPDATE campaign_leads
         SET status = 'active', touch_count = MAX(touch_count, ?), last_touch_at = ?
         WHERE id = ?`
      ).run(send.touch_number, sentAt, send.campaign_lead_id);
      this.usage.safeRecord({
        provider: 'google',
        service: 'gmail_api',
        operation: 'send_email',
        units: 1,
        unitName: 'message',
        estimatedCostUsd: 0,
        occurredAt: sentAt,
        metadata: { send_id: send.id }
      });
      return { id: send.id, status: 'sent' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db.prepare(
        `UPDATE email_sends SET status = 'failed', error_message = ? WHERE id = ?`
      ).run(message, send.id);
      this.logger.error?.(message);
      return { id: send.id, status: 'failed', error: message };
    }
  }

  recoverAfterLongGap({ now, maxGapMinutes = 120 } = {}) {
    const previous = readSetting(this.db, 'outreach.last_send_worker_tick');
    writeSetting(this.db, 'outreach.last_send_worker_tick', now.toISOString(), now);
    if (!previous) return null;

    const gapMs = now.getTime() - new Date(previous).getTime();
    if (!Number.isFinite(gapMs) || gapMs <= maxGapMinutes * 60 * 1000) return null;

    const recovery = new StartupRecovery({ db: this.db, logger: this.logger }).rescheduleMissedSends({
      now,
      graceMinutes: maxGapMinutes,
    });
    this.db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run('outreach.last_send_worker_gap', JSON.stringify({
      previous_tick_at: previous,
      current_tick_at: now.toISOString(),
      gap_minutes: Math.round(gapMs / 60000),
      rescheduled_sends: recovery,
    }), now.toISOString());
    return recovery;
  }

  async tick({ now = new Date(), limit = 1 } = {}) {
    this.recoverAfterLongGap({ now });
    const sends = this.dueSends({ now, limit });
    const results = [];
    for (const send of sends) {
      results.push(await this.processSend(send, now));
    }
    return results;
  }
}
