import { getDb } from '@/lib/db.js';
import StatusPill from '@/components/StatusPill';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function History({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    week?: string;
    minScore?: string;
    maxScore?: string;
  }>;
}) {
  const { search, status, week, minScore, maxScore } = await searchParams;
  const db = getDb();

  const totalLeads = (db.prepare('SELECT COUNT(*) as c FROM leads').get() as any).c;
  const contactedCount = (
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE status != 'new'").get() as any
  ).c;
  const interestedCount = (
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'interested'").get() as any
  ).c;
  const contactedRate = totalLeads > 0 ? Math.round((contactedCount / totalLeads) * 100) : 0;
  const conversionRate = totalLeads > 0 ? Math.round((interestedCount / totalLeads) * 100) : 0;

  let query = 'SELECT * FROM leads WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    query += ' AND (business_name LIKE ? OR address LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (week) {
    query += ' AND week = ?';
    params.push(week);
  }
  if (minScore) {
    query += ' AND total_score >= ?';
    params.push(Number(minScore));
  }
  if (maxScore) {
    query += ' AND total_score <= ?';
    params.push(Number(maxScore));
  }

  query += ' ORDER BY created_at DESC';
  const leads = db.prepare(query).all(...params) as any[];
  const weeks: string[] = db
    .prepare('SELECT DISTINCT week FROM leads ORDER BY week DESC')
    .all()
    .map((r: any) => r.week);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">History</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{totalLeads}</p>
          <p className="text-sm text-gray-500">Total Leads</p>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{contactedRate}%</p>
          <p className="text-sm text-gray-500">Contacted Rate</p>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{conversionRate}%</p>
          <p className="text-sm text-gray-500">Interested Rate</p>
        </div>
      </div>

      <form className="flex gap-3 mb-4 flex-wrap" method="GET">
        <input
          name="search"
          type="text"
          placeholder="Search name or address..."
          defaultValue={search || ''}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-48"
        />
        <select
          name="status"
          defaultValue={status || ''}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="rejected">Rejected</option>
          <option value="closed">Closed</option>
        </select>
        <select
          name="week"
          defaultValue={week || ''}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All weeks</option>
          {weeks.map(w => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <input
          name="minScore"
          type="number"
          placeholder="Min score"
          defaultValue={minScore || ''}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-24"
        />
        <input
          name="maxScore"
          type="number"
          placeholder="Max score"
          defaultValue={maxScore || ''}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-24"
        />
        <button
          type="submit"
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Filter
        </button>
      </form>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Business</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Week</th>
              <th className="text-right px-4 py-2 font-medium">Score</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={'/leads/' + lead.id} className="text-blue-600 hover:underline">
                    {lead.business_name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{lead.type}</td>
                <td className="px-4 py-2 text-gray-500">{lead.week}</td>
                <td className="px-4 py-2 text-right font-medium">{lead.total_score}</td>
                <td className="px-4 py-2">
                  <StatusPill status={lead.status} />
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
