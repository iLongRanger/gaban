import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db.js';
import CampaignActions from '@/components/CampaignActions';
import OutcomeForm from '@/components/OutcomeForm';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusClasses(status: string) {
  if (status === 'sent') return 'bg-green-100 text-green-700';
  if (status === 'scheduled') return 'bg-blue-100 text-blue-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  if (status === 'cancelled') return 'bg-gray-100 text-gray-600';
  if (status === 'replied') return 'bg-green-100 text-green-700';
  if (status === 'bounced') return 'bg-red-100 text-red-700';
  if (status === 'unsubscribed') return 'bg-amber-100 text-amber-700';
  if (status === 'sending') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-700';
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const campaign = db.prepare(
    `SELECT c.*, p.name AS preset_name, p.categories
     FROM campaigns c
     JOIN presets p ON p.id = c.preset_id
     WHERE c.id = ?`
  ).get(id) as any;
  if (!campaign) notFound();

  const leads = db.prepare(
    `SELECT cl.*, l.business_name, l.email, l.address, l.total_score, l.distance_km
     FROM campaign_leads cl
     JOIN leads l ON l.id = cl.lead_id
     WHERE cl.campaign_id = ?
     ORDER BY l.total_score DESC, l.business_name ASC`
  ).all(id) as any[];

  const sends = db.prepare(
    `SELECT es.*
     FROM email_sends es
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     WHERE cl.campaign_id = ?
     ORDER BY es.scheduled_for ASC, es.touch_number ASC`
  ).all(id) as any[];

  const sendsByLead = new Map<number, any[]>();
  for (const send of sends) {
    const current = sendsByLead.get(send.campaign_lead_id) || [];
    current.push(send);
    sendsByLead.set(send.campaign_lead_id, current);
  }

  const sentCount = sends.filter((send) => send.status === 'sent').length;
  const scheduledCount = sends.filter((send) => send.status === 'scheduled').length;
  const failedCount = sends.filter((send) => send.status === 'failed').length;
  const replyCount = leads.filter((lead) => lead.status === 'replied').length;
  const bounceCount = leads.filter((lead) => lead.status === 'bounced').length;
  const categories = JSON.parse(campaign.categories || '[]').join(', ');

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to campaigns
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-500">
            {campaign.preset_name} · {categories}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide bg-gray-100 text-gray-700 px-2 py-1 rounded">
            {campaign.status}
          </span>
          <CampaignActions campaignId={campaign.id} status={campaign.status} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Leads</span>
          <span className="text-xl font-semibold">{leads.length}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Scheduled</span>
          <span className="text-xl font-semibold">{scheduledCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Sent</span>
          <span className="text-xl font-semibold">{sentCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Failed</span>
          <span className="text-xl font-semibold">{failedCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Replies</span>
          <span className="text-xl font-semibold">{replyCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Bounces</span>
          <span className="text-xl font-semibold">{bounceCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Daily Cap</span>
          <span className="text-xl font-semibold">{campaign.daily_cap}</span>
        </div>
      </div>

      <div className="space-y-3">
        {leads.map((lead) => {
          const leadSends = sendsByLead.get(lead.id) || [];
          return (
            <div key={lead.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{lead.business_name}</h2>
                  <p className="text-xs text-gray-500">{lead.email} · {lead.address || 'No address'}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded mb-2 ${statusClasses(lead.status)}`}>
                    {lead.status}
                  </span>
                  <span className="block text-sm font-semibold text-blue-600">{lead.total_score}</span>
                  <span className="block text-xs text-gray-400">{lead.distance_km} km</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {leadSends.map((send) => (
                  <div key={send.id} className="border border-gray-100 rounded p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Touch {send.touch_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${statusClasses(send.status)}`}>
                        {send.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{send.template_style}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(send.scheduled_for)}</p>
                    {send.error_message ? (
                      <p className="text-xs text-red-600 mt-2">{send.error_message}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <OutcomeForm campaignLeadId={lead.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
