import Link from 'next/link';
import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function eventClasses(type: string) {
  if (type === 'replied') return 'bg-green-100 text-green-700';
  if (type === 'bounced') return 'bg-red-100 text-red-700';
  if (type === 'unsubscribed') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-700';
}

function parsePayload(value: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export default async function ResponsesPage() {
  const db = getDb();
  const events = db.prepare(
    `SELECT ee.*, es.recipient_email, es.subject AS sent_subject, es.touch_number,
            cl.status AS lead_status, l.business_name,
            c.id AS campaign_id, c.name AS campaign_name
     FROM email_events ee
     JOIN email_sends es ON es.id = ee.send_id
     JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
     JOIN leads l ON l.id = cl.lead_id
     JOIN campaigns c ON c.id = cl.campaign_id
     WHERE ee.type IN ('replied', 'bounced', 'unsubscribed')
     ORDER BY ee.detected_at DESC, ee.id DESC
     LIMIT 100`
  ).all() as any[];

  const replyCount = events.filter((event) => event.type === 'replied').length;
  const bounceCount = events.filter((event) => event.type === 'bounced').length;
  const unsubscribeCount = events.filter((event) => event.type === 'unsubscribed').length;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Responses</h1>
          <p className="text-sm text-gray-500">Replies, bounces, and unsubscribes detected from campaign email threads.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Replies</span>
          <span className="text-xl font-semibold">{replyCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Bounces</span>
          <span className="text-xl font-semibold">{bounceCount}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <span className="block text-xs text-gray-400">Unsubscribes</span>
          <span className="text-xl font-semibold">{unsubscribeCount}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No responses detected yet.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const payload = parsePayload(event.raw_payload) as any;
            return (
              <div key={event.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${eventClasses(event.type)}`}>
                        {event.type}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(event.detected_at)}</span>
                    </div>
                    <h2 className="font-semibold text-gray-900">{event.business_name}</h2>
                    <p className="text-sm text-gray-500">{event.recipient_email}</p>
                  </div>
                  <Link href={`/campaigns/${event.campaign_id}`} className="text-sm text-blue-600 hover:underline">
                    Open campaign
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                  <div>
                    <span className="block text-xs text-gray-400">Campaign</span>
                    <span className="font-medium">{event.campaign_name}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-400">Touch</span>
                    <span className="font-medium">{event.touch_number}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-400">Lead Status</span>
                    <span className="font-medium">{event.lead_status}</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
                  <p>
                    <span className="text-gray-400">Original subject:</span>{' '}
                    <span className="text-gray-700">{event.sent_subject}</span>
                  </p>
                  {payload.subject ? (
                    <p className="mt-1">
                      <span className="text-gray-400">Detected subject:</span>{' '}
                      <span className="text-gray-700">{payload.subject}</span>
                    </p>
                  ) : null}
                  {payload.from ? (
                    <p className="mt-1">
                      <span className="text-gray-400">From:</span>{' '}
                      <span className="text-gray-700">{payload.from}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
