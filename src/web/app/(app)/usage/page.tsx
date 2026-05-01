import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import { UsageService } from '../../../../services/usageService.js';

export const dynamic = 'force-dynamic';

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat('en-CA').format(Math.round(value || 0));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function Card({ card }: { card: any }) {
  return (
    <section className="frame frame--brackets" style={{ padding: '18px 20px', minHeight: 190 }}>
      <span className="br-tr" /><span className="br-bl" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>{card.provider}</div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{card.service}</h2>
        </div>
        <div className="numeric" style={{ fontSize: 24, color: card.estimatedCostUsd > 0 ? 'var(--warn)' : 'var(--accent)' }}>
          {money(card.estimatedCostUsd)}
        </div>
      </div>
      <div className="numeric" style={{ marginTop: 18, fontSize: 22 }}>{card.usageLabel}</div>
      <p style={{ color: 'var(--mute)', fontSize: 13, margin: '10px 0 12px' }}>{card.note}</p>
      <div className="label" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>{card.priceLabel}</div>
      <Link
        href={card.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="label"
        style={{ display: 'inline-block', color: 'var(--accent)', marginTop: 12, textDecoration: 'none' }}
      >
        OPEN PROVIDER PRICING
      </Link>
    </section>
  );
}

export default async function UsagePage() {
  const summary = new UsageService({ db: getDb() }).monthlySummary();

  return (
    <div className="boot">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, marginBottom: 6 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>USAGE / 08</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>API usage and cost</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
            Local metering for provider calls, with estimated monthly spend from published prices.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label">ESTIMATED THIS MONTH</div>
          <div className="numeric" style={{ fontSize: 30, color: 'var(--accent)' }}>
            {money(summary.totalEstimatedCostUsd)}
          </div>
        </div>
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 22 }}>
        {summary.cards.map((card: any) => <Card key={card.provider} card={card} />)}
      </div>

      <section className="frame frame--brackets" style={{ padding: '18px 20px', marginBottom: 22 }}>
        <span className="br-tr" /><span className="br-bl" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div className="label">MONTHLY BREAKDOWN</div>
            <p style={{ color: 'var(--mute)', fontSize: 13, margin: '6px 0 0' }}>
              Month: {summary.month}. Costs are estimates; provider dashboards remain the billing source of truth.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr className="label" style={{ textAlign: 'left', color: 'var(--mute)' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)' }}>Provider</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)' }}>Operation</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)' }}>Model</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)', textAlign: 'right' }}>Units</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)', textAlign: 'right' }}>Tokens</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)', textAlign: 'right' }}>Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '18px 8px', color: 'var(--mute)' }}>
                    No metered API usage has been recorded yet. New runs will appear here.
                  </td>
                </tr>
              ) : summary.rows.map((row: any) => (
                <tr key={`${row.provider}-${row.service}-${row.operation}-${row.model || 'none'}`}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)' }}>{row.provider}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)' }}>{row.operation}</td>
                  <td className="numeric" style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)' }}>{row.model || '-'}</td>
                  <td className="numeric" style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)', textAlign: 'right' }}>{number(row.units)}</td>
                  <td className="numeric" style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)', textAlign: 'right' }}>
                    {number(row.input_tokens + row.output_tokens)}
                  </td>
                  <td className="numeric" style={{ padding: '10px 8px', borderBottom: '1px dashed var(--line)', textAlign: 'right' }}>{money(row.estimated_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="frame frame--brackets" style={{ padding: '18px 20px' }}>
        <span className="br-tr" /><span className="br-bl" />
        <div className="label" style={{ marginBottom: 12 }}>RECENT METERED CALLS</div>
        {summary.recentEvents.length === 0 ? (
          <p style={{ color: 'var(--mute)', fontSize: 13, margin: 0 }}>No recent usage events.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {summary.recentEvents.map((event: any, index: number) => (
              <div
                key={`${event.occurred_at}-${index}`}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', borderBottom: '1px dashed var(--line)', paddingBottom: 8 }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{event.provider} / {event.operation}</div>
                  <div className="label" style={{ color: 'var(--faint)', marginTop: 4 }}>{formatDate(event.occurred_at)}</div>
                </div>
                <div className="numeric" style={{ color: 'var(--ink-2)' }}>
                  {event.model || `${number(event.units)} ${event.unit_name}`}
                </div>
                <div className="numeric" style={{ color: 'var(--accent)' }}>{money(Number(event.estimated_cost_usd || 0))}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
