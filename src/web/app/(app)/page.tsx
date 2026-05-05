import { getDb } from '@/lib/db.js';
import LeadCard from '@/components/LeadCard';
import RunSelector from '@/components/RunSelector';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; status?: string; sort?: string }>;
}) {
  const { run, status, sort } = await searchParams;
  const db = getDb();

  const runs = db
    .prepare(
      `SELECT r.id, r.started_at, p.name AS preset_name, COUNT(lrr.id) AS lead_count
       FROM pipeline_runs r
       LEFT JOIN presets p ON p.id = r.preset_id
       LEFT JOIN lead_run_results lrr ON lrr.run_id = r.id
       WHERE r.status = 'completed'
       GROUP BY r.id
       HAVING lead_count > 0
       ORDER BY r.started_at DESC`
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      label: `${r.preset_name || 'Deleted preset'} - ${new Date(r.started_at).toLocaleString()} - ${r.lead_count} leads`,
    }));
  const currentRun = run || (runs[0] ? String(runs[0].id) : '');

  let query = `
    SELECT l.*, lrr.rank, lrr.total_score AS run_score
    FROM lead_run_results lrr
    JOIN leads l ON l.id = lrr.lead_id
    WHERE lrr.run_id = ?`;
  const params: unknown[] = [currentRun];

  if (status) {
    query += ' AND l.status = ?';
    params.push(status);
  }

  const sortCol =
    sort === 'distance'
      ? 'l.distance_km ASC'
      : sort === 'name'
        ? 'l.business_name ASC'
        : 'lrr.rank ASC';
  query += ' ORDER BY ' + sortCol;

  const leads = currentRun ? (db.prepare(query).all(...params) as any[]) : [];
  const top = leads[0]?.total_score ?? 0;
  const avg = leads.length ? Math.round(leads.reduce((a: number, l: any) => a + (l.total_score || 0), 0) / leads.length) : 0;

  return (
    <div className="boot">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>FEED / 02</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Run leads</h1>
        </div>
        {runs.length > 0 && <RunSelector runs={runs} current={currentRun} />}
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, marginBottom: 24 }}>
        <span className="label numeric">N={leads.length}</span>
        <span style={{ color: 'var(--line-2)' }}>|</span>
        <span className="label numeric">TOP {top}</span>
        <span style={{ color: 'var(--line-2)' }}>|</span>
        <span className="label numeric">AVG {avg}</span>
        <span style={{ color: 'var(--line-2)' }}>|</span>
        <span className="label">SORT / {(sort || 'run').toUpperCase()}</span>
      </div>

      <hr className="hr-fade" style={{ marginBottom: 24 }} />

      {leads.length === 0 ? (
        <div className="frame frame--brackets" style={{ padding: 40, textAlign: 'center' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ color: 'var(--mute)' }}>NO SIGNAL</div>
          <p style={{ marginTop: 8, color: 'var(--mute)' }}>No leads for this run.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leads.map((lead: any) => (
            <LeadCard key={`${currentRun}-${lead.id}`} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
