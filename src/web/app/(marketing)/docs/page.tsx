import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Docs · Gaban',
  description:
    'How Gaban works — pipeline phases, configuration, deployment, and the operator console.',
};

const TOC = [
  ['overview', '01 · Overview'],
  ['install', '02 · Installation'],
  ['env', '03 · Environment & secrets'],
  ['pipeline', '04 · The pipeline'],
  ['scoring', '05 · Scoring model'],
  ['drafting', '06 · Drafting & sequences'],
  ['console', '07 · Operator console'],
  ['data', '08 · Data & backups'],
  ['ops', '09 · Operations'],
  ['testing', '10 · Testing'],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80, marginBottom: 56 }}>
      <div className="label" style={{ color: 'var(--accent)', marginBottom: 8 }}>
        # {id.toUpperCase()}
      </div>
      <h2
        style={{
          fontSize: 26,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
          borderBottom: '1px solid var(--line)',
          paddingBottom: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ color: 'var(--ink-2)', lineHeight: 1.7, fontSize: 15 }}>{children}</div>
    </section>
  );
}

const codeStyle: React.CSSProperties = {
  display: 'block',
  background: 'var(--elev)',
  border: '1px solid var(--line)',
  padding: 16,
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: 'pre',
  overflowX: 'auto',
  margin: '12px 0',
  color: 'var(--ink)',
};

const inline: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.92em',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  padding: '1px 6px',
  border: '1px solid var(--line)',
};

export default function DocsPage() {
  return (
    <div className="boot" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 48 }}>
      {/* TOC */}
      <aside style={{ position: 'sticky', top: 96, alignSelf: 'flex-start', height: 'fit-content' }}>
        <div className="label" style={{ marginBottom: 14 }}>CONTENTS</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TOC.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="nav-link"
              style={{ fontSize: 13, padding: '4px 0' }}
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>DOCUMENTATION / 00</div>
        <h1 style={{ fontSize: 38, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
          How Gaban works
        </h1>
        <p style={{ color: 'var(--mute)', fontSize: 16, marginBottom: 40, maxWidth: 680 }}>
          A tour of the pipeline, the operator console, and the moving parts you will
          touch when running it in production.
        </p>

        <Section id="overview" title="Overview">
          <p>
            Gaban is two things in one repository: a Node.js <strong>pipeline</strong> that
            generates ranked, drafted leads on a schedule, and a Next.js{' '}
            <strong>operator console</strong> (codename <em>Halon</em>) for reviewing,
            editing, sending, and tracking outreach.
          </p>
          <code style={codeStyle}>{`Outscraper ─▶ Discovery
seen_leads  ─▶ Filtering
OpenAI      ─▶ Scoring
OpenAI      ─▶ Drafting
SQLite      ◀─ Export ──▶ CSV fallback
                  │
                  ▼
            Halon console (send queue, replies, schedules)`}</code>
        </Section>

        <Section id="install" title="Installation">
          <p>Requires Node 22+ and a writable working directory.</p>
          <code style={codeStyle}>{`git clone <repo> gaban && cd gaban
npm install
cp .env.example .env       # fill the secrets
npm test                   # 145 tests, ~2s
npm run dev                # operator console at :3003
npm start                  # run the pipeline once`}</code>
          <p>
            For Windows boxes, <span style={inline}>scripts/install-startup-tasks.ps1</span>{' '}
            wires the pipeline + console into Task Scheduler so they auto-start on boot.
          </p>
        </Section>

        <Section id="env" title="Environment & secrets">
          <p>Required:</p>
          <code style={codeStyle}>{`OUTSCRAPER_API_KEY=
OPENAI_API_KEY=
WEB_PIN=                  # operator console login`}</code>
          <p>For sending and integrations:</p>
          <code style={codeStyle}>{`GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GOOGLE_SHEETS_CREDENTIALS= # optional Sheets export`}</code>
        </Section>

        <Section id="pipeline" title="The pipeline">
          <p>
            Entrypoint: <span style={inline}>src/cli/run.js</span>. Each phase is a service
            in <span style={inline}>src/services/</span>:
          </p>
          <ul style={{ paddingLeft: 20 }}>
            <li>
              <strong>Discovery</strong> — Outscraper queries per category × geography.
              Results normalized into a single lead shape.
            </li>
            <li>
              <strong>Filtering</strong> — drop closed/duplicate/out-of-range; consult the
              persistent <span style={inline}>seen_leads</span> ledger.
            </li>
            <li>
              <strong>Scoring</strong> — OpenAI rates each lead 0–100 against six factors;
              top-N capped per run.
            </li>
            <li>
              <strong>Drafting</strong> — three voices × (email, DM) per surviving lead.
            </li>
            <li>
              <strong>Export</strong> — written to{' '}
              <span style={inline}>data/gaban.sqlite</span> (CSV fallback if the DB is
              locked).
            </li>
          </ul>
          <p>Override behavior per run:</p>
          <code style={codeStyle}>{`node src/cli/run.js --config ./override.json

# override.json
{
  "search":          { "location": "New Westminster, BC", "radius_km": 12 },
  "office_location": { "lat": 49.20, "lng": -122.91 },
  "categories":      ["restaurants", "cafes"],
  "scoring":         { "top_n": 5 }
}`}</code>
        </Section>

        <Section id="scoring" title="Scoring model">
          <p>Six factors, each with its own weight and reasoning string:</p>
          <ol style={{ paddingLeft: 20 }}>
            <li>Size signals (employee count, square footage hints, review volume)</li>
            <li>Cleanliness pain (industry, review keywords, hygiene-sensitive category)</li>
            <li>Location proximity to your office_location</li>
            <li>Online presence quality (website, hours, photos)</li>
            <li>Business age / stability</li>
            <li>Likelihood they do not yet have a recurring cleaner</li>
          </ol>
          <p>
            The console renders each factor as a segmented score meter so the operator can
            see <em>why</em> a lead ranked where it did.
          </p>
        </Section>

        <Section id="drafting" title="Drafting & sequences">
          <p>Each lead gets three drafts in distinct voices:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li><strong>Curious neighbor</strong> — low-pressure, local-first.</li>
            <li><strong>Value lead</strong> — leads with a concrete offer.</li>
            <li><strong>Compliment question</strong> — opens with specific praise + one Q.</li>
          </ul>
          <p>
            Drafts are editable in <span style={inline}>04 / CAMPAIGNS</span>. Sequences add
            follow-ups with day offsets, the send queue enforces per-day warm-up caps, and
            every send carries a unique unsubscribe token resolved at{' '}
            <span style={inline}>/u/[token]</span>.
          </p>
        </Section>

        <Section id="console" title="Operator console">
          <p>Nine sections, all sharing the Halon design language:</p>
          <code style={codeStyle}>{`01 / OVERVIEW   sent today, scheduled, replies, telemetry
02 / WEEKLY     current cycle's leads, sortable
03 / HISTORY    past cycles, filterable
04 / CAMPAIGNS  sequences, send queues, outcome forms
05 / RESPONSES  replies, bounces, unsubscribes
06 / OUTCOMES   meetings, contracts, dispositions
07 / RUNS       pipeline run logs, cancel + tail
08 / USAGE      token / API spend
09 / SETTINGS   presets, schedules, suppressions`}</code>
        </Section>

        <Section id="data" title="Data & backups">
          <p>
            All persistent state lives in <span style={inline}>data/gaban.sqlite</span>.
            Key tables: <span style={inline}>leads</span>,{' '}
            <span style={inline}>outreach_drafts</span>,{' '}
            <span style={inline}>campaigns</span>, <span style={inline}>email_sends</span>,{' '}
            <span style={inline}>email_events</span>,{' '}
            <span style={inline}>presets</span>, <span style={inline}>schedules</span>,{' '}
            <span style={inline}>suppressions</span>,{' '}
            <span style={inline}>pipeline_runs</span>.
          </p>
          <p>
            <strong>BackupService</strong> writes a daily snapshot to{' '}
            <span style={inline}>data/backups/YYYY-MM-DD.sqlite</span> when the web server
            boots. Recover a fallback CSV with{' '}
            <span style={inline}>scripts/import-leads-csv.mjs</span>.
          </p>
        </Section>

        <Section id="ops" title="Operations">
          <ul style={{ paddingLeft: 20 }}>
            <li>
              <strong>Schedules</strong> live in the DB (<span style={inline}>schedules</span>{' '}
              table) and are picked up by the scheduler service. Run weekly by default.
            </li>
            <li>
              <strong>Run logs</strong> stream live to <span style={inline}>07 / RUNS</span>;
              you can cancel a run mid-flight.
            </li>
            <li>
              <strong>Heartbeat</strong> reports liveness — visible on{' '}
              <span style={inline}>01 / OVERVIEW</span>.
            </li>
            <li>
              <strong>Healthcheck</strong> at <span style={inline}>/api/health</span> for
              uptime monitoring.
            </li>
          </ul>
        </Section>

        <Section id="testing" title="Testing">
          <code style={codeStyle}>{`npm test            # full suite, ~2s
npm run test:watch  # iterate`}</code>
          <p>
            Coverage spans every service plus the CLI <span style={inline}>run.js</span>{' '}
            end-to-end with mocked clients. New features should ship with a test in{' '}
            <span style={inline}>tests/</span>.
          </p>
        </Section>

        <hr className="hr-fade" style={{ margin: '48px 0 24px' }} />
        <p style={{ color: 'var(--mute)', fontSize: 14 }}>
          Stuck on something? <Link href="/support" className="nav-link">Open a support
          ticket →</Link>
        </p>
      </div>
    </div>
  );
}
