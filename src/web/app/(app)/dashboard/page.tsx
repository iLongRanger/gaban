import '@/lib/loadEnv.js';
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

function buildHealthActions(heartbeat: any, healthcheck: any, publicAppUrl: string | undefined) {
  const actions = [];
  const responseMonitor = parseJson(heartbeat.last_response_monitor);

  if (!heartbeat.gmail_configured) {
    actions.push({
      title: 'Gmail OAuth is missing from the running web task',
      detail: 'Confirm GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL are present in .env, then restart Gaban Bot Web.'
    });
  }

  if (healthcheck?.public_url_ok === false) {
    actions.push({
      title: 'Public bot URL is not reachable',
      detail: 'Restart Gaban Cloudflare Tunnel, then test PUBLIC_APP_URL in a browser or with curl.exe -I https://bot.gleamlift.ca.'
    });
  }

  if (!publicAppUrl) {
    actions.push({
      title: 'PUBLIC_APP_URL is not configured',
      detail: 'Set PUBLIC_APP_URL to the public bot URL so unsubscribe links and health checks can verify the tunnel.'
    });
  }

  if (healthcheck?.db_writable === false) {
    actions.push({
      title: 'SQLite database is not writable',
      detail: 'Check that the app can write to the data folder and that the database is not locked by another process.'
    });
  }

  if (responseMonitor?.ok === false) {
    const missingScope = String(responseMonitor.message || '').toLowerCase().includes('insufficient authentication scopes');
    actions.push({
      title: missingScope ? 'Gmail OAuth is missing inbox read permission' : 'Gmail response monitor is failing',
      detail: missingScope
        ? 'Create a new Google OAuth refresh token with both gmail.send and gmail.readonly scopes, update GMAIL_OAUTH_REFRESH_TOKEN in .env, then restart Gaban Bot Web.'
        : `Check the response monitor error, then restart Gaban Bot Web. Last error: ${responseMonitor.message || 'unknown error'}`
    });
  }

  if (heartbeat.sending_stale > 0) {
    actions.push({
      title: 'Some sends are stuck in sending state',
      detail: 'Restart Gaban Bot Web so startup recovery can mark or reschedule stuck sends.'
    });
  }

  if (actions.length === 0 && healthcheck?.ok === false) {
    actions.push({
      title: 'Saved health check has not refreshed yet',
      detail: 'The running web task has the required env vars now. Wait up to 10 minutes for the scheduled health check, or restart Gaban Bot Web and refresh the dashboard.'
    });
  }

  return actions;
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

  const healthcheck = parseJson(heartbeat.last_healthcheck);
  const workerGap = parseJson(heartbeat.last_send_worker_gap);
  const responseMonitor = parseJson(heartbeat.last_response_monitor);
  const healthOk = heartbeat.gmail_configured && heartbeat.sending_stale === 0 && healthcheck?.ok !== false && responseMonitor?.ok !== false;
  const healthActions = buildHealthActions(heartbeat, healthcheck, process.env.PUBLIC_APP_URL);

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

      {!healthOk && (
        <section className="frame frame--brackets" style={{ padding: '16px 18px', marginBottom: 22, borderColor: 'var(--danger)' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <div className="label" style={{ color: 'var(--danger)', marginBottom: 8 }}>HEALTH ACTIONS</div>
              <h2 style={{ margin: 0, fontSize: 17 }}>System needs attention</h2>
              <p style={{ fontSize: 13, color: 'var(--mute)', margin: '6px 0 0' }}>
                Follow the checks below, then restart the affected scheduled task.
              </p>
            </div>
            <span className="tag tag--danger">FAIL</span>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {(healthActions.length > 0 ? healthActions : [{
              title: 'Health check failed',
              detail: 'Review System Telemetry below, restart Gaban Bot Web, and run the health check again.'
            }]).map((action) => (
              <div key={action.title} style={{ borderLeft: '2px solid var(--danger)', padding: '2px 0 2px 12px' }}>
                <div style={{ fontWeight: 650, fontSize: 13 }}>{action.title}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3 }}>{action.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

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
          <Row
            k="RESPONSE MONITOR"
            v={responseMonitor ? `${responseMonitor.ok ? 'OK' : 'FAIL'} · ${formatDate(responseMonitor.checked_at)}` : '—'}
            tone={responseMonitor?.ok === false ? 'err' : responseMonitor?.ok ? 'ok' : undefined}
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
