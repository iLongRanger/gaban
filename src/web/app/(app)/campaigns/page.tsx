import Link from 'next/link';
import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const db = getDb();
  const campaigns = db.prepare(
    `SELECT c.*, p.name AS preset_name,
            COUNT(DISTINCT cl.id) AS lead_count,
            SUM(CASE WHEN es.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
            SUM(CASE WHEN es.status = 'sent' THEN 1 ELSE 0 END) AS sent_count
     FROM campaigns c
     JOIN presets p ON p.id = c.preset_id
     LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
     LEFT JOIN email_sends es ON es.campaign_lead_id = cl.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all() as any[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-gray-500">Create outreach sequences from manually approved leads.</p>
        </div>
        <Link href="/campaigns/new" className="bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium">
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No campaigns yet. Create one after you run a preset and approve leads.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{campaign.name}</h2>
                  <p className="text-sm text-gray-500">{campaign.preset_name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {campaign.lead_count || 0} leads · {campaign.sent_count || 0} sent · {campaign.scheduled_count || 0} scheduled
                  </p>
                </div>
                <span className="text-xs uppercase tracking-wide bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  {campaign.status}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4 text-sm">
                <div>
                  <span className="block text-xs text-gray-400">Daily cap</span>
                  <span className="font-medium">{campaign.daily_cap}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400">Start</span>
                  <span className="font-medium">{campaign.start_date ? new Date(campaign.start_date).toLocaleString() : '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400">Window</span>
                  <span className="font-medium">{campaign.send_window_start}-{campaign.send_window_end}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400">Timezone</span>
                  <span className="font-medium">{campaign.timezone}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
