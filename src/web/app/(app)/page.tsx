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

  const leads = currentWeek ? db.prepare(query).all(...params) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Weekly Leads</h1>
        <div className="flex items-center gap-3">
          {weeks.length > 0 && <WeekSelector weeks={weeks} current={currentWeek} />}
        </div>
      </div>

      {leads.length === 0 ? (
        <p className="text-gray-500">No leads for this week.</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead: any) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
