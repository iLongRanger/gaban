import { verifyUnsubscribeToken } from './unsubscribeTokenService.js';
import { SuppressionService } from './suppressionService.js';

export function getUnsubscribePreview({ db, token, secret }) {
  if (!secret) throw new Error('server misconfigured');

  const payload = verifyUnsubscribeToken(token, secret);
  const sendId = payload.sendId;
  const row = db.prepare(
    'SELECT recipient_email, campaign_lead_id FROM email_sends WHERE id = ?'
  ).get(sendId);

  if (!row) throw new Error('send not found');

  return {
    sendId,
    email: row.recipient_email,
    campaignLeadId: row.campaign_lead_id
  };
}

export function confirmUnsubscribe({ db, token, secret }) {
  const preview = getUnsubscribePreview({ db, token, secret });
  const suppression = new SuppressionService({ db });
  suppression.add({ email: preview.email, reason: 'unsubscribed', source: 'click' });

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE campaign_leads SET status = 'unsubscribed', completed_at = ? WHERE id = ?`
  ).run(now, preview.campaignLeadId);

  db.prepare(
    `UPDATE email_sends SET status = 'cancelled' WHERE campaign_lead_id = ? AND status = 'scheduled'`
  ).run(preview.campaignLeadId);

  db.prepare(
    `INSERT OR IGNORE INTO email_events (send_id, type, detected_at) VALUES (?, 'unsubscribed', ?)`
  ).run(preview.sendId, now);

  return preview;
}
