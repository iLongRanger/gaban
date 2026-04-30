import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default async function OutcomesPage() {
  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const meetings = db.prepare(
    `SELECT m.*, l.business_name, c.name AS campaign_name
     FROM meetings m
     JOIN campaign_leads cl ON cl.id = m.campaign_lead_id
     JOIN leads l ON l.id = cl.lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     ORDER BY m.scheduled_for DESC
     LIMIT 100`
  ).all() as any[];
  const contracts = db.prepare(
    `SELECT ct.*, l.business_name, c.name AS campaign_name
     FROM contracts ct
     JOIN campaign_leads cl ON cl.id = ct.campaign_lead_id
     JOIN leads l ON l.id = cl.lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     ORDER BY ct.signed_date DESC, ct.id DESC
     LIMIT 100`
  ).all() as any[];
  const monthContracts = contracts.filter((contract) => String(contract.signed_date || '').startsWith(month));
  const monthlyValue = monthContracts.reduce((sum, contract) => sum + Number(contract.value_monthly || 0), 0);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Outcomes</h1>
          <p className="text-sm text-gray-500">Meetings, signed contracts, and monthly outreach results.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Contracts This Month</span>
          <span className="text-xl font-semibold">{monthContracts.length}/1</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Monthly Value</span>
          <span className="text-xl font-semibold">${monthlyValue.toLocaleString()}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Meetings Logged</span>
          <span className="text-xl font-semibold">{meetings.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Upcoming / Recent Meetings</h2>
          {meetings.length === 0 ? (
            <p className="text-sm text-gray-500">No meetings logged yet.</p>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="border border-gray-100 rounded p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{meeting.business_name}</span>
                    <span className="text-xs text-gray-500">{meeting.kind}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{meeting.campaign_name} · {formatDate(meeting.scheduled_for)}</p>
                  {meeting.notes ? <p className="text-xs text-gray-600 mt-2">{meeting.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Contracts</h2>
          {contracts.length === 0 ? (
            <p className="text-sm text-gray-500">No contracts logged yet.</p>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <div key={contract.id} className="border border-gray-100 rounded p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{contract.business_name}</span>
                    <span className="text-xs text-gray-500">${Number(contract.value_monthly || 0).toLocaleString()}/mo</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{contract.campaign_name} · {contract.signed_date}</p>
                  {contract.notes ? <p className="text-xs text-gray-600 mt-2">{contract.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
