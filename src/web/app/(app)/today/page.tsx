import Link from 'next/link';
import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

const TIME_ZONE = 'America/Vancouver';

function localDayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-CA', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value: Date) {
  return value.toLocaleDateString('en-CA', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function statusTagClass(status: string) {
  if (['active', 'scheduled', 'sent'].includes(status)) return 'tag tag--accent';
  if (['paused', 'sending'].includes(status)) return 'tag tag--warn';
  if (['failed', 'bounced', 'cancelled'].includes(status)) return 'tag tag--danger';
  return 'tag tag--mute';
}

export default async function TodayPage() {
  const db = getDb();
  const { start, end } = localDayRange();
  const sends = db.prepare(
    `SELECT es.id,
            es.touch_number,
            es.template_style,
            es.subject,
            es.body,
            es.recipient_email,
            es.scheduled_for,
            es.status AS send_status,
            es.error_message,
            cl.status AS campaign_lead_status,
            c.id AS campaign_id,
            c.name AS campaign_name,
            c.status AS campaign_status,
            c.send_window_start,
            c.send_window_end,
            l.id AS lead_id,
            l.business_name,
            l.address
     FROM email_sends es
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     JOIN leads l ON l.id = cl.lead_id
     WHERE es.status = 'scheduled'
       AND es.scheduled_for >= ?
       AND es.scheduled_for < ?
     ORDER BY es.scheduled_for ASC, es.id ASC`
  ).all(start.toISOString(), end.toISOString()) as any[];

  const activeCount = sends.filter((send) => send.campaign_status === 'active').length;
  const heldCount = sends.length - activeCount;
  const nextSend = sends.find((send) => send.campaign_status === 'active');

  return (
    <div className="boot">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>TODAY - 05</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Scheduled email queue</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
            Messages scheduled for {formatDate(start)} in Vancouver time.
          </p>
        </div>
        <span className="tag tag--accent">{sends.length} SCHEDULED</span>
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        <div className="frame frame--brackets" style={{ padding: '14px 16px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 10 }}>SENDABLE TODAY</div>
          <div className="numeric" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent)' }}>{activeCount}</div>
        </div>
        <div className="frame frame--brackets" style={{ padding: '14px 16px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 10 }}>HELD BY CAMPAIGN</div>
          <div className="numeric" style={{ fontSize: 26, fontWeight: 600, color: heldCount ? 'var(--warn)' : 'var(--ink)' }}>{heldCount}</div>
        </div>
        <div className="frame frame--brackets" style={{ padding: '14px 16px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 10 }}>NEXT ACTIVE SEND</div>
          <div className="numeric" style={{ fontSize: 26, fontWeight: 600 }}>{nextSend ? formatTime(nextSend.scheduled_for) : '-'}</div>
        </div>
      </div>

      {sends.length === 0 ? (
        <section className="frame frame--brackets" style={{ padding: '22px 24px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <h2 style={{ fontSize: 18, margin: 0 }}>No scheduled emails today</h2>
          <p style={{ color: 'var(--mute)', fontSize: 13, margin: '8px 0 0' }}>
            The send worker is active, but there are no scheduled email rows for today.
          </p>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sends.map((send) => (
            <article key={send.id} className="frame frame--brackets" style={{ padding: '16px 18px' }}>
              <span className="br-tr" /><span className="br-bl" />
              <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) auto', gap: 16, alignItems: 'start' }}>
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>SEND TIME</div>
                  <div className="numeric" style={{ fontSize: 22, fontWeight: 650 }}>{formatTime(send.scheduled_for)}</div>
                  <div className="label" style={{ marginTop: 8 }}>TOUCH {send.touch_number}</div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Link href={`/leads/${send.lead_id}`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
                      {send.business_name}
                    </Link>
                    <span className={statusTagClass(send.campaign_status)}>{send.campaign_status}</span>
                    <span className={statusTagClass(send.send_status)}>{send.send_status}</span>
                  </div>

                  <div style={{ color: 'var(--mute)', fontSize: 12, marginBottom: 10 }}>
                    {send.recipient_email} / {send.address || 'No address'}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <div>
                      <div className="label" style={{ marginBottom: 4 }}>SUBJECT</div>
                      <div style={{ fontSize: 14, fontWeight: 650 }}>{send.subject}</div>
                    </div>
                    <div>
                      <div className="label" style={{ marginBottom: 4 }}>MESSAGE</div>
                      <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>
                        {send.body}
                      </p>
                    </div>
                    {send.error_message ? (
                      <div style={{ color: 'var(--warn)', fontSize: 12 }}>
                        Last note: {send.error_message}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 150 }}>
                  <Link href={`/campaigns/${send.campaign_id}`} className="label" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    OPEN CAMPAIGN
                  </Link>
                  <div style={{ fontWeight: 650, marginTop: 8, fontSize: 13 }}>{send.campaign_name}</div>
                  <div className="label" style={{ marginTop: 6 }}>
                    {send.send_window_start}-{send.send_window_end}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
