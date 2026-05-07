import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gaban — Lead Operator Console',
  description:
    'A five-phase lead-generation pipeline and outreach console. Discover, score, draft, and send — without the SaaS sprawl.',
};

const PHASES = [
  {
    code: '01',
    name: 'Discovery',
    body: 'Pull local businesses by category and radius via Outscraper / Google Maps. One pass, deduplicated against a persistent ledger of leads you have already seen.',
  },
  {
    code: '02',
    name: 'Filtering',
    body: 'Drop closed listings, out-of-radius results, and previously contacted businesses. Configurable per preset.',
  },
  {
    code: '03',
    name: 'Scoring',
    body: 'An OpenAI prompt rates every survivor against six weighted factors: size signals, cleanliness pain, location, web presence, business age, current cleaner. Top-N only.',
  },
  {
    code: '04',
    name: 'Drafting',
    body: 'Three outreach styles per lead — curious neighbor, value lead, compliment question — with both an email body and a DM variant. Edit inline before sending.',
  },
  {
    code: '05',
    name: 'Export & Send',
    body: 'Persisted to local SQLite (CSV fallback), surfaced in the Halon console, and dispatched through your own Gmail with warm-up caps and unsubscribe handling.',
  },
];

const FEATURES = [
  ['Single operator, full stack', 'Pipeline, sequence scheduler, send queue, response monitor — one app, one PIN.'],
  ['Local-first storage', 'better-sqlite3 with daily backups. No vendor lock, no row-pricing.'],
  ['Transparent scoring', 'Every score is broken down into the six factors that produced it. No black box.'],
  ['Warm-up safe sending', 'Per-day caps, suppression list, unsubscribe tokens, bounce handling out of the box.'],
  ['Run logs you can tail', 'Pipeline runs stream live; cancel, replay, inspect token + API spend.'],
  ['Halon design system', 'Cyber-instrumentation aesthetic with first-class light/dark mode.'],
];

export default function ProductPage() {
  return (
    <div className="boot">
      {/* HERO */}
      <section
        className="frame frame--brackets"
        style={{
          padding: '56px 40px',
          marginBottom: 48,
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(800px 400px at 80% 0%, var(--spot-1), transparent 60%), var(--surface)',
        }}
      >
        <span className="br-tl" />
        <span className="br-tr" />
        <span className="br-bl" />
        <span className="br-br" />

        <div className="label" style={{ marginBottom: 18 }}>
          INDEX / 00 · LEAD OPERATOR CONSOLE
        </div>
        <h1
          style={{
            fontSize: 'clamp(36px, 5vw, 64px)',
            lineHeight: 1.05,
            margin: 0,
            maxWidth: 920,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Lead generation that runs itself —{' '}
          <span style={{ color: 'var(--accent)' }}>and shows its work.</span>
        </h1>
        <p
          style={{
            marginTop: 22,
            fontSize: 18,
            lineHeight: 1.55,
            maxWidth: 720,
            color: 'var(--ink-2)',
          }}
        >
          Gaban is a five-phase pipeline plus a single-operator console. It discovers
          businesses, scores them with explainable AI, drafts personalized outreach in
          three voices, and sends through your inbox — with suppression, warm-up caps,
          and reply tracking already wired in.
        </p>

        <div style={{ display: 'flex', gap: 14, marginTop: 32, flexWrap: 'wrap' }}>
          <Link
            href="/docs"
            className="btn btn--primary"
            style={{ padding: '12px 22px', fontSize: 14 }}
          >
            Read the docs →
          </Link>
          <Link
            href="/support"
            className="btn"
            style={{ padding: '12px 22px', fontSize: 14 }}
          >
            Talk to us
          </Link>
        </div>

        <div
          style={{
            marginTop: 44,
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div className="label">PIPELINE</div>
            <div className="numeric" style={{ fontSize: 22 }}>5 PHASES</div>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--line-2)' }} />
          <div>
            <div className="label">TESTS</div>
            <div className="numeric" style={{ fontSize: 22 }}>145 PASSING</div>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--line-2)' }} />
          <div>
            <div className="label">STACK</div>
            <div className="numeric" style={{ fontSize: 22 }}>NODE · NEXT 16 · SQLITE</div>
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section style={{ marginBottom: 64 }}>
        <div className="label" style={{ marginBottom: 8 }}>SECTION / 01</div>
        <h2 style={{ fontSize: 32, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          The pipeline
        </h2>
        <p style={{ color: 'var(--mute)', maxWidth: 640, margin: '0 0 32px' }}>
          Five phases, run on a schedule or on demand. Each phase is observable, testable,
          and fully overridable per preset.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {PHASES.map((p) => (
            <div
              key={p.code}
              className="frame"
              style={{ padding: 22, background: 'var(--surface)' }}
            >
              <div
                className="label numeric"
                style={{ color: 'var(--accent)', marginBottom: 10 }}
              >
                PHASE / {p.code}
              </div>
              <h3 style={{ fontSize: 18, margin: '0 0 8px' }}>{p.name}</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY */}
      <section style={{ marginBottom: 64 }}>
        <div className="label" style={{ marginBottom: 8 }}>SECTION / 02</div>
        <h2 style={{ fontSize: 32, margin: '0 0 32px', letterSpacing: '-0.01em' }}>
          Why operators pick it
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 1,
            background: 'var(--line)',
            border: '1px solid var(--line)',
          }}
        >
          {FEATURES.map(([title, body]) => (
            <div key={title} style={{ background: 'var(--surface)', padding: 24 }}>
              <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'var(--mute)', margin: 0, lineHeight: 1.55 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING / CTA */}
      <section
        className="frame frame--brackets"
        style={{
          padding: '40px 32px',
          background: 'var(--surface)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <span className="br-tl" />
        <span className="br-br" />
        <div className="label" style={{ marginBottom: 12 }}>SECTION / 03 · GET STARTED</div>
        <h2 style={{ fontSize: 28, margin: '0 0 12px', letterSpacing: '-0.01em' }}>
          Self-host it. Own the data. Pay for what you use.
        </h2>
        <p style={{ color: 'var(--mute)', maxWidth: 560, margin: '0 auto 24px' }}>
          Gaban is a Node + Next.js app you run on your own machine or VPS. Your only
          variable costs are Outscraper credits and OpenAI tokens — both visible in the
          <span className="numeric" style={{ color: 'var(--ink)' }}> 08 / USAGE </span>
          panel.
        </p>
        <div
          style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <Link
            href="/docs"
            className="btn btn--primary"
            style={{ padding: '12px 22px', fontSize: 14 }}
          >
            Installation guide →
          </Link>
          <Link href="/support" className="btn" style={{ padding: '12px 22px', fontSize: 14 }}>
            Request a demo
          </Link>
        </div>
      </section>
    </div>
  );
}
