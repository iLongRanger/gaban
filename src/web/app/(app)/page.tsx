import { getDb } from '@/lib/db.js';
import LeadCard from '@/components/LeadCard';
import WeekSelector from '@/components/WeekSelector';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; status?: string; sort?: string }>;
}) {
  const { week, status, sort } = await searchParams;
  const db = getDb();

  const weeks: string[] = db
    .prepare('SELECT DISTINCT week FROM leads ORDER BY week DESC')
    .all()
    .map((r: any) => r.week);
  const currentWeek = week || weeks[0] || '';

  let query = 'SELECT * FROM leads WHERE week = ?';
  const params: unknown[] = [currentWeek];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  const sortCol =
    sort === 'distance'
      ? 'distance_km ASC'
      : sort === 'name'
        ? 'business_name ASC'
        : 'total_score DESC';
  query += ' ORDER BY ' + sortCol;

  const leads = currentWeek ? (db.prepare(query).all(...params) as any[]) : [];
  const top = leads[0]?.total_score ?? 0;
  const avg = leads.length ? Math.round(leads.reduce((a: number, l: any) => a + (l.total_score || 0), 0) / leads.length) : 0;

  return (
    <div className="boot">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>FEED · 02</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Weekly leads</h1>
        </div>
        {weeks.length > 0 && <WeekSelector weeks={weeks} current={currentWeek} />}
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, marginBottom: 24 }}>
        <span className="label numeric">N={leads.length}</span>
        <span style={{ color: 'var(--line-2)' }}>│</span>
        <span className="label numeric">TOP {top}</span>
        <span style={{ color: 'var(--line-2)' }}>│</span>
        <span className="label numeric">AVG {avg}</span>
        <span style={{ color: 'var(--line-2)' }}>│</span>
        <span className="label">SORT · {(sort || 'score').toUpperCase()}</span>
      </div>

      <hr className="hr-fade" style={{ marginBottom: 24 }} />

      {leads.length === 0 ? (
        <div className="frame frame--brackets" style={{ padding: 40, textAlign: 'center' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ color: 'var(--mute)' }}>NO SIGNAL</div>
          <p style={{ marginTop: 8, color: 'var(--mute)' }}>No leads for this cycle.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leads.map((lead: any) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
