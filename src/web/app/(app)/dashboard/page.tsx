import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import { HeartbeatService } from '../../../../services/heartbeatService.js';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default async function DashboardPage() {
  const db = getDb();
  const Heartbeat = HeartbeatService as any;
  const heartbeat = new Heartbeat({ db }).snapshot();
  const recentResponses = db.prepare(
    `SELECT ee.type, ee.detected_at, es.recipient_email, l.business_name, c.id AS campaign_id, c.name AS campaign_name
     FROM email_events ee
     JOIN email_sends es ON es.id = ee.send_id
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     JOIN leads l ON l.id = cl.lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     WHERE ee.type IN ('replied', 'bounced', 'unsubscribed')
     ORDER BY ee.detected_at DESC, ee.id DESC
     LIMIT 5`
  ).all() as any[];

  const healthOk = heartbeat.gmail_configured && heartbeat.sending_stale === 0;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">Outreach health, queue status, and recent response activity.</p>
        </div>
        <span className={`text-xs uppercase tracking-wide px-2 py-1 rounded ${healthOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {healthOk ? 'Healthy' : 'Needs attention'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Sent Today</span>
          <span className="text-xl font-semibold">{heartbeat.sent_today}/{heartbeat.daily_cap}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Scheduled</span>
          <span className="text-xl font-semibold">{heartbeat.scheduled_sends}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Active Campaigns</span>
          <span className="text-xl font-semibold">{heartbeat.active_campaigns}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Replies Today</span>
          <span className="text-xl font-semibold">{heartbeat.replies_waiting}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-3">System</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Gmail OAuth</span>
              <span className={heartbeat.gmail_configured ? 'text-green-700' : 'text-red-700'}>
                {heartbeat.gmail_configured ? 'Configured' : 'Missing env'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Stale sending rows</span>
              <span className={heartbeat.sending_stale === 0 ? 'text-green-700' : 'text-red-700'}>{heartbeat.sending_stale}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Next send</span>
              <span className="text-gray-700">{formatDate(heartbeat.next_send_at)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Last backup</span>
              <span className="text-gray-700">{formatDate(heartbeat.last_backup_at)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Last checked</span>
              <span className="text-gray-700">{formatDate(heartbeat.checked_at)}</span>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Recent Responses</h2>
            <Link href="/responses" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {recentResponses.length === 0 ? (
            <p className="text-sm text-gray-500">No responses detected yet.</p>
          ) : (
            <div className="space-y-3">
              {recentResponses.map((event) => (
                <Link
                  key={`${event.detected_at}-${event.recipient_email}`}
                  href={`/campaigns/${event.campaign_id}`}
                  className="block border border-gray-100 rounded p-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm text-gray-900">{event.business_name}</span>
                    <span className="text-xs text-gray-500">{event.type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{event.campaign_name} · {formatDate(event.detected_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
