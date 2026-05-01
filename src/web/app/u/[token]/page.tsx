import '@/lib/loadEnv.js';
import { getDb } from '@/lib/db.js';
import { getUnsubscribePreview } from '../../../../services/unsubscribeService.js';

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
    const db = getDb();
    const preview = getUnsubscribePreview({ db, token, secret });
    sendId = preview.sendId;
    email = preview.email;
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
          <h1>Confirm unsubscribe</h1>
          <p>This will stop future outreach from {operatingName || legalName} to <strong>{email}</strong>.</p>
          <form action={`/api/unsubscribe/${token}`} method="post">
            <button
              type="submit"
              style={{
                background: '#111827',
                border: 0,
                borderRadius: 6,
                color: 'white',
                cursor: 'pointer',
                fontSize: 16,
                padding: '10px 16px'
              }}
            >
              Confirm unsubscribe
            </button>
          </form>
          <p style={{ color: '#666', fontSize: 14 }}>If you opened this by mistake, you can close this page. Nothing has been changed yet.</p>
          <p style={{ color: '#888', fontSize: 13 }}>Reference: {sendId}</p>
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
