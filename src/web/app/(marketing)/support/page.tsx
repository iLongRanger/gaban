import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support · Gaban',
  description: 'Troubleshooting, FAQs, and how to reach the team behind Gaban.',
};

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'The pipeline ran but no leads landed in the console.',
    a: (
      <>
        Check <code>07 / RUNS</code> for the run status. If filtering removed everything,
        widen <code>radius_km</code> or relax the dedupe ledger by clearing entries from{' '}
        <code>seen_leads</code>. If discovery returned zero, your Outscraper key is likely
        out of credits — verify in <code>08 / USAGE</code>.
      </>
    ),
  },
  {
    q: 'Scoring fails partway through a run.',
    a: (
      <>
        Almost always an OpenAI rate limit or expired key. Tail{' '}
        <code>logs/pipeline.log</code> for the exact error. Reduce <code>top_n</code> in
        your preset, or set a smaller batch concurrency, then re-run.
      </>
    ),
  },
  {
    q: 'Gmail sends are failing with 401 / invalid_grant.',
    a: (
      <>
        Refresh tokens expire when scopes change or when the Google account password is
        rotated. Re-run the OAuth flow and update <code>GMAIL_REFRESH_TOKEN</code> in your{' '}
        <code>.env</code>. Restart the web server after editing.
      </>
    ),
  },
  {
    q: 'The console redirects me to /login on every page.',
    a: (
      <>
        Your session cookie is invalid or <code>WEB_PIN</code> changed. Log in again. If
        it loops, clear cookies for the host and confirm <code>WEB_PIN</code> in the
        running process matches what you are typing.
      </>
    ),
  },
  {
    q: 'I lost a run — can I recover the leads?',
    a: (
      <>
        Yes. CSV fallbacks are written to <code>data/exports/</code> on every export.
        Import one back into SQLite with{' '}
        <code>node scripts/import-leads-csv.mjs &lt;path&gt;</code>. Daily DB snapshots
        also live in <code>data/backups/</code>.
      </>
    ),
  },
  {
    q: 'Can I run this for a business other than Gleam Pro?',
    a: (
      <>
        Yes — every behavior is preset-driven. Create a new preset in{' '}
        <code>09 / SETTINGS</code> with your own categories, geography, scoring weights,
        and outreach voice templates. The pipeline accepts a per-run{' '}
        <code>--config</code> override too.
      </>
    ),
  },
];

const codeInline: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.92em',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  padding: '1px 6px',
  border: '1px solid var(--line)',
};

export default function SupportPage() {
  return (
    <div className="boot">
      <div className="label" style={{ marginBottom: 8 }}>SUPPORT / 00</div>
      <h1 style={{ fontSize: 38, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
        We are here when the pipeline isn't.
      </h1>
      <p style={{ color: 'var(--mute)', fontSize: 16, maxWidth: 680, marginBottom: 40 }}>
        Most issues are a misconfigured preset, a stale credential, or an upstream rate
        limit. Start with the FAQ — if you are still stuck, the channels below get a
        human.
      </p>

      {/* CONTACT GRID */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 56,
        }}
      >
        <div className="frame frame--brackets" style={{ padding: 22, background: 'var(--surface)' }}>
          <span className="br-tl" /><span className="br-br" />
          <div className="label" style={{ color: 'var(--accent)', marginBottom: 10 }}>CHANNEL / 01</div>
          <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>Email</h3>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 10px', lineHeight: 1.55 }}>
            For incidents, billing, and anything that needs a paper trail.
          </p>
          <a
            href="mailto:support@gaban.app"
            className="nav-link"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          >
            support@gaban.app
          </a>
        </div>

        <div className="frame frame--brackets" style={{ padding: 22, background: 'var(--surface)' }}>
          <span className="br-tl" /><span className="br-br" />
          <div className="label" style={{ color: 'var(--accent)', marginBottom: 10 }}>CHANNEL / 02</div>
          <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>GitHub Issues</h3>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 10px', lineHeight: 1.55 }}>
            Bugs, feature requests, and configuration help — public and searchable.
          </p>
          <span className="numeric" style={{ fontSize: 13, color: 'var(--mute)' }}>
            github.com/&lt;your-org&gt;/gaban/issues
          </span>
        </div>

        <div className="frame frame--brackets" style={{ padding: 22, background: 'var(--surface)' }}>
          <span className="br-tl" /><span className="br-br" />
          <div className="label" style={{ color: 'var(--accent)', marginBottom: 10 }}>CHANNEL / 03</div>
          <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>Status</h3>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 10px', lineHeight: 1.55 }}>
            Self-hosted? Check your own healthcheck:
          </p>
          <span style={codeInline}>GET /api/health</span>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ marginBottom: 64 }}>
        <div className="label" style={{ marginBottom: 8 }}>SECTION / 01</div>
        <h2 style={{ fontSize: 28, margin: '0 0 24px', letterSpacing: '-0.01em' }}>
          Frequently asked
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(({ q, a }, i) => (
            <details
              key={q}
              className="frame"
              style={{ background: 'var(--surface)', padding: '14px 18px' }}
              open={i === 0}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 15,
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{q}</span>
                <span className="label numeric" style={{ color: 'var(--accent)' }}>
                  Q / {String(i + 1).padStart(2, '0')}
                </span>
              </summary>
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--line)',
                  color: 'var(--ink-2)',
                  fontSize: 14,
                  lineHeight: 1.65,
                }}
              >
                {a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* DIAGNOSTICS */}
      <section
        className="frame frame--brackets"
        style={{ padding: 28, background: 'var(--surface)', marginBottom: 48 }}
      >
        <span className="br-tl" /><span className="br-br" />
        <div className="label" style={{ marginBottom: 10 }}>SECTION / 02 · BEFORE OPENING A TICKET</div>
        <h2 style={{ fontSize: 22, margin: '0 0 14px' }}>Run the diagnostic checklist</h2>
        <ol style={{ paddingLeft: 20, color: 'var(--ink-2)', lineHeight: 1.7, fontSize: 14 }}>
          <li>
            Tail the latest run log under <span style={codeInline}>logs/</span> and grab
            the last 100 lines.
          </li>
          <li>
            Confirm <span style={codeInline}>npm test</span> passes on your machine.
          </li>
          <li>
            Note your Node version (<span style={codeInline}>node -v</span>) and OS — Node
            22+ is required.
          </li>
          <li>
            Capture the failing run id from <span style={codeInline}>07 / RUNS</span> so we
            can trace it.
          </li>
        </ol>
      </section>

      <hr className="hr-fade" style={{ margin: '32px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link href="/docs" className="nav-link">← Back to docs</Link>
        <Link href="/product" className="nav-link">Product overview →</Link>
      </div>
    </div>
  );
}
