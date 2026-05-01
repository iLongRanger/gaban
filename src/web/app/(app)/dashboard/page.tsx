import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import { HeartbeatService } from '../../../../services/heartbeatService.js';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="frame frame--brackets" style={{ padding: '14px 16px', minHeight: 92 }}>
      <span className="br-tr" /><span className="br-bl" />
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div className="numeric" style={{ fontSize: 26, fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--ink)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div className="label numeric" style={{ marginTop: 6, color: 'var(--faint)' }}>{sub}</div>}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'ok' | 'warn' | 'err' }) {
  const color =
    tone === 'ok' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--danger)' : 'var(--ink-2)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
      <span className="label" style={{ color: 'var(--mute)' }}>{k}</span>
      <span className="numeric" style={{ fontSize: 12, color }}>{v}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const db = getDb();
  const Heartbeat = HeartbeatService as any;
  const heartbeat = new Heartbeat({ db }).snapshot();
  const recentResponses = db.prepare(
    `SELECT ee.type, ee.detected_at, es.recipient_email, l.business_name, c.id AS campaign_id, c.name AS campaign_name
     FROM email_events ee
     JOIN email_sends es ON es.id = ee.send_id
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     JOIN leads l ON l.id = cl.lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     WHERE ee.type IN ('replied', 'bounced', 'unsubscribed')
     ORDER BY ee.detected_at DESC, ee.id DESC
     LIMIT 5`
  ).all() as any[];

  const healthOk = heartbeat.gmail_configured && heartbeat.sending_stale === 0;
  const healthcheck = parseJson(heartbeat.last_healthcheck);
  const workerGap = parseJson(heartbeat.last_send_worker_gap);

  return (
    <div className="boot">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>OVERVIEW · 01</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Operator dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
            Outreach health, queue status, and recent response telemetry.
          </p>
        </div>
        <span className={'tag ' + (healthOk ? 'tag--accent' : 'tag--danger')}>
          {healthOk ? 'NOMINAL' : 'NEEDS ATTENTION'}
        </span>
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Stat
          label="SENT TODAY"
          value={<><span>{heartbeat.sent_today}</span><span style={{ color: 'var(--faint)', fontSize: 16 }}> / {heartbeat.daily_cap}</span></>}
          accent
        />
        <Stat label="SCHEDULED" value={heartbeat.scheduled_sends} />
        <Stat label="ACTIVE CAMPAIGNS" value={heartbeat.active_campaigns} />
        <Stat label="REPLIES TODAY" value={heartbeat.replies_waiting} accent />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <section className="frame frame--brackets" style={{ padding: '18px 20px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="label">SYSTEM TELEMETRY</div>
            <span className="pulse-dot" />
          </div>

          <Row k="GMAIL OAUTH" v={heartbeat.gmail_configured ? 'CONFIGURED' : 'MISSING ENV'} tone={heartbeat.gmail_configured ? 'ok' : 'err'} />
          <Row k="STALE SENDS" v={heartbeat.sending_stale} tone={heartbeat.sending_stale === 0 ? 'ok' : 'err'} />
          <Row k="NEXT SEND" v={formatDate(heartbeat.next_send_at)} />
          <Row k="LAST BACKUP" v={formatDate(heartbeat.last_backup_at)} />
          <Row
            k="HEALTH CHECK"
            v={healthcheck ? `${healthcheck.ok ? 'OK' : 'FAIL'} · ${formatDate(healthcheck.checked_at)}` : '—'}
            tone={healthcheck?.ok === false ? 'err' : 'ok'}
          />
          <Row
            k="WORKER GAP"
            v={workerGap ? `${workerGap.gap_minutes}m · ${workerGap.rescheduled_sends} moved` : '—'}
          />
          <Row k="LAST CHECKED" v={formatDate(heartbeat.checked_at)} />
        </section>

        <section className="frame frame--brackets" style={{ padding: '18px 20px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="label">RECENT RESPONSES</div>
            <Link href="/responses" className="label" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              VIEW ALL →
            </Link>
          </div>

          {recentResponses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>No responses detected.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentResponses.map((event) => (
                <Link
                  key={`${event.detected_at}-${event.recipient_email}`}
                  href={`/campaigns/${event.campaign_id}`}
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderLeft: '1px solid var(--line-2)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 140ms ease',
                  }}
                  className="hover:border-accent"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{event.business_name}</span>
                    <span className={
                      'tag ' +
                      (event.type === 'replied' ? 'tag--accent' : event.type === 'bounced' ? 'tag--danger' : 'tag--warn')
                    }>
                      {event.type}
                    </span>
                  </div>
                  <div className="label numeric" style={{ marginTop: 6, color: 'var(--faint)' }}>
                    {event.campaign_name} · {formatDate(event.detected_at)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
