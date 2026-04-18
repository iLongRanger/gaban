import { getDb } from '@/lib/db.js';
import { verifyUnsubscribeToken } from '../../../../services/unsubscribeTokenService.js';
import { SuppressionService } from '../../../../services/suppressionService.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PageProps = { params: Promise<{ token: string }> };

export default async function UnsubscribePage({ params }: PageProps) {
  const { token } = await params;
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  const legalName = process.env.BUSINESS_LEGAL_NAME || 'Our Business';
  const operatingName = process.env.BUSINESS_OPERATING_NAME || '';
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS || '';

  let sendId: number | null = null;
  let email: string | null = null;
  let errorMessage: string | null = null;

  try {
    if (!secret) throw new Error('server misconfigured');
    const payload = verifyUnsubscribeToken(token, secret) as { sendId: number };
    sendId = payload.sendId;

    const db = getDb();
    const row = db.prepare(
      'SELECT recipient_email, campaign_lead_id FROM email_sends WHERE id = ?'
    ).get(sendId) as { recipient_email: string; campaign_lead_id: number } | undefined;

    if (!row) throw new Error('send not found');
    email = row.recipient_email;

    const suppression = new SuppressionService({ db });
    suppression.add({ email, reason: 'unsubscribed', source: 'click' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE campaign_leads SET status = 'unsubscribed', completed_at = ? WHERE id = ?`
    ).run(now, row.campaign_lead_id);

    db.prepare(
      `UPDATE email_sends SET status = 'cancelled' WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(row.campaign_lead_id);

    db.prepare(
      `INSERT INTO email_events (send_id, type, detected_at) VALUES (?, 'unsubscribed', ?)`
    ).run(sendId, now);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <main style={{ maxWidth: 560, margin: '64px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
      {errorMessage ? (
        <>
          <h1>We couldn&apos;t process that unsubscribe link.</h1>
          <p>The link may have expired or been tampered with. If you received an email from us and don&apos;t want to hear from us again, please reply with &ldquo;STOP&rdquo; and we will remove you manually within 10 business days.</p>
          <p style={{ color: '#888', fontSize: 13 }}>Error: {errorMessage}</p>
        </>
      ) : (
        <>
          <h1>You&apos;ve been unsubscribed.</h1>
          <p>{operatingName || legalName} will no longer contact <strong>{email}</strong>.</p>
          <p>If this was a mistake, just reply to any of our earlier emails and we&apos;ll add you back.</p>
        </>
      )}
      <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #eee' }} />
      <footer style={{ fontSize: 13, color: '#666' }}>
        <div><strong>{legalName}</strong>{operatingName ? ` (operating as ${operatingName})` : ''}</div>
        <div>{mailingAddress}</div>
      </footer>
    </main>
  );
}
