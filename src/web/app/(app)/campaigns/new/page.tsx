import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import CampaignCreateForm from '@/components/CampaignCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const db = getDb();
  const presets = db.prepare('SELECT * FROM presets ORDER BY is_default DESC, created_at DESC').all() as any[];
  const runs = db.prepare(
    `SELECT r.id, r.preset_id, r.started_at, p.name AS preset_name, COUNT(lrr.id) AS lead_count
     FROM pipeline_runs r
     JOIN presets p ON p.id = r.preset_id
     JOIN lead_run_results lrr ON lrr.run_id = r.id
     WHERE r.status = 'completed'
     GROUP BY r.id
     ORDER BY r.started_at DESC`
  ).all() as any[];
  const leads = db.prepare(
    `SELECT l.*,
            lrr.run_id,
            lrr.rank,
            r.preset_id,
            COUNT(od.id) AS draft_count
     FROM lead_run_results lrr
     JOIN pipeline_runs r ON r.id = lrr.run_id
     JOIN leads l ON l.id = lrr.lead_id
     LEFT JOIN outreach_drafts od ON od.lead_id = l.id
     WHERE l.email IS NOT NULL
       AND l.email != ''
       AND l.status NOT IN ('rejected', 'closed')
     GROUP BY lrr.run_id, l.id
     ORDER BY r.started_at DESC, lrr.rank ASC`
  ).all() as any[];

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to campaigns
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Campaign</h1>
        <p className="text-sm text-gray-500">
          Choose one preset run, then select the leads you want the bot to sequence.
        </p>
      </div>

      {presets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Create a preset in Settings before starting a campaign.
        </div>
      ) : (
        <CampaignCreateForm presets={presets} runs={runs} leads={leads} />
      )}
    </div>
  );
}
