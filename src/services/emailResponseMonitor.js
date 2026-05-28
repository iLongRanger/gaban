import { CampaignService } from './campaignService.js';

const DEFAULT_HEADERS = ['From', 'To', 'Subject', 'Message-ID', 'In-Reply-To', 'References', 'Auto-Submitted'];

function headerValue(message, name) {
  const headers = message?.payload?.headers || [];
  const found = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

function normalizeEmail(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function isBounce(message) {
  const from = headerValue(message, 'From').toLowerCase();
  const subject = headerValue(message, 'Subject').toLowerCase();
  return (
    from.includes('mailer-daemon') ||
    from.includes('postmaster') ||
    subject.includes('undeliverable') ||
    subject.includes('delivery has failed') ||
    subject.includes('delivery status notification')
  );
}

function isAutoReply(message) {
  const subject = headerValue(message, 'Subject').toLowerCase();
  const autoSubmitted = headerValue(message, 'Auto-Submitted').toLowerCase();
  return (
    subject.includes('automatic reply') ||
    subject.includes('auto reply') ||
    subject.includes('auto-reply') ||
    subject.includes('out of office') ||
    subject.includes('out-of-office') ||
    autoSubmitted.includes('auto-replied')
  );
}

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row?.value;
}

function messageEventExists(db, gmailMessageId) {
  const escaped = String(gmailMessageId).replaceAll('"', '\\"');
  const row = db.prepare(
    `SELECT id
     FROM email_events
     WHERE raw_payload LIKE ?
     LIMIT 1`
  ).get(`%"gmail_message_id":"${escaped}"%`);
  return Boolean(row);
}

function findMatchingSend(db, message) {
  const threadId = message.threadId;
  const inReplyTo = headerValue(message, 'In-Reply-To');
  const references = headerValue(message, 'References');

  const byThread = db.prepare(
    `SELECT es.*, cl.id AS campaign_lead_id, cl.status AS campaign_lead_status
     FROM email_sends es
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     WHERE es.gmail_thread_id = ?
       AND es.status = 'sent'
     ORDER BY es.touch_number DESC, es.sent_at DESC
     LIMIT 1`
  ).get(threadId);
  if (byThread) return byThread;

  const replyRefs = [inReplyTo, references].filter(Boolean).join(' ');
  if (!replyRefs) return null;

  return db.prepare(
    `SELECT es.*, cl.id AS campaign_lead_id, cl.status AS campaign_lead_status
     FROM email_sends es
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     WHERE es.status = 'sent'
       AND es.gmail_rfc_message_id IS NOT NULL
       AND instr(?, es.gmail_rfc_message_id) > 0
     ORDER BY es.touch_number DESC, es.sent_at DESC
     LIMIT 1`
  ).get(replyRefs);
}

export class EmailResponseMonitor {
  constructor({ db, gmail, senderEmail, logger = console } = {}) {
    if (!db) throw new Error('db required');
    if (!gmail) throw new Error('gmail required');
    if (!senderEmail) throw new Error('senderEmail required');
    this.db = db;
    this.gmail = gmail;
    this.senderEmail = senderEmail.toLowerCase();
    this.logger = logger;
    this.campaigns = new CampaignService({ db });
  }

  async poll({ query = 'in:inbox newer_than:14d', maxResults = 25, now = new Date() } = {}) {
    const messages = await this.gmail.listMessages({ query, maxResults });
    const results = [];
    for (const item of messages) {
      try {
        const message = await this.gmail.getMessage({
          id: item.id,
          format: 'metadata',
          metadataHeaders: DEFAULT_HEADERS,
        });
        const result = this.processMessage(message, now);
        if (result) results.push(result);
      } catch (err) {
        this.logger.error?.(err instanceof Error ? err.message : String(err));
      }
    }
    return results;
  }

  processMessage(message, now = new Date()) {
    if (!message?.id || !message?.threadId) return null;
    if (messageEventExists(this.db, message.id)) return { id: message.id, status: 'skipped', reason: 'already processed' };

    const fromEmail = normalizeEmail(headerValue(message, 'From'));
    if (fromEmail === this.senderEmail) {
      return { id: message.id, status: 'skipped', reason: 'sender message' };
    }

    const send = findMatchingSend(this.db, message);
    if (!send) return { id: message.id, status: 'skipped', reason: 'no matching send' };

    const type = isBounce(message) ? 'bounced' : isAutoReply(message) ? 'auto_replied' : 'replied';
    const autoReplyAction = readSetting(this.db, 'outreach.auto_reply_action') || 'continue';
    const shouldCompleteLead = type !== 'auto_replied' || autoReplyAction === 'cancel';
    const completedStatus = type === 'bounced' ? 'bounced' : type === 'auto_replied' ? 'auto_replied' : 'replied';
    const detectedAt = now.toISOString();
    const rawPayload = JSON.stringify({
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      from: headerValue(message, 'From'),
      subject: headerValue(message, 'Subject'),
    });

    const apply = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
         VALUES (?, ?, ?, ?)`
      ).run(send.id, type, detectedAt, rawPayload);
      if (shouldCompleteLead) {
        this.db.prepare(
          `UPDATE campaign_leads
           SET status = ?, completed_at = ?
           WHERE id = ?`
        ).run(completedStatus, detectedAt, send.campaign_lead_id);
        this.campaigns.cancelFutureSends(send.campaign_lead_id, { reason: type });
      }
    });
    apply();

    if (shouldCompleteLead) {
      const link = this.db.prepare('SELECT campaign_id FROM campaign_leads WHERE id = ?').get(send.campaign_lead_id);
      if (link?.campaign_id) {
        try {
          this.campaigns.finalizeIfDone(link.campaign_id, now);
        } catch (hookErr) {
          this.logger?.error?.(`finalize hook failed: ${hookErr.message}`);
        }
      }
    }

    return { id: message.id, status: type, send_id: send.id, campaign_lead_id: send.campaign_lead_id };
  }
}
