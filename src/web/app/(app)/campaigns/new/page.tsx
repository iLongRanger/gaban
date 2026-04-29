import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import CampaignCreateForm from '@/components/CampaignCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const db = getDb();
  const presets = db.prepare('SELECT * FROM presets ORDER BY is_default DESC, created_at DESC').all() as any[];
  const weeks = db.prepare('SELECT DISTINCT week FROM leads ORDER BY week DESC').all().map((row: any) => row.week) as string[];
  const leads = db.prepare(
    `SELECT l.*,
            COUNT(od.id) AS draft_count
     FROM leads l
     LEFT JOIN outreach_drafts od ON od.lead_id = l.id
     WHERE l.email IS NOT NULL
       AND l.email != ''
       AND l.status NOT IN ('rejected', 'closed')
     GROUP BY l.id
     ORDER BY l.week DESC, l.total_score DESC`
  ).all() as any[];

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to campaigns
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Campaign</h1>
        <p className="text-sm text-gray-500">
          Choose the target preset, then select the leads you want the bot to sequence.
        </p>
      </div>

      {presets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Create a preset in Settings before starting a campaign.
        </div>
      ) : (
        <CampaignCreateForm presets={presets} leads={leads} weeks={weeks} />
      )}
    </div>
  );
}
