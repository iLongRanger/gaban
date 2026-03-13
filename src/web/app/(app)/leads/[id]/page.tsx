import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db.js';
import ScoreBreakdown from '@/components/ScoreBreakdown';
import OutreachEditor from '@/components/OutreachEditor';
import NotesSection from '@/components/NotesSection';
import StatusDropdown from '@/components/StatusDropdown';

export const dynamic = 'force-dynamic';

export default async function LeadDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as any;
  if (!lead) notFound();

  const drafts = db
    .prepare('SELECT * FROM outreach_drafts WHERE lead_id = ? ORDER BY style')
    .all(id) as any[];
  const notes = db
    .prepare('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC')
    .all(id) as any[];

  const factorScores = JSON.parse(lead.factor_scores || '{}');
  const reviewsData = JSON.parse(lead.reviews_data || '[]');

  return (
    <div className="max-w-3xl">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to leads
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{lead.business_name}</h1>
          <p className="text-gray-500">{lead.type}</p>
          <p className="text-sm text-gray-400">
            {lead.address} &middot; {lead.distance_km} km
          </p>
        </div>
        <StatusDropdown leadId={lead.id} initialStatus={lead.status} />
      </div>

      <section className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-2">Contact</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {lead.phone && (
            <div>
              <span className="text-gray-500">Phone:</span>{' '}
              <a href={'tel:' + lead.phone} className="text-blue-600">
                {lead.phone}
              </a>
            </div>
          )}
          {lead.email && (
            <div>
              <span className="text-gray-500">Email:</span>{' '}
              <a href={'mailto:' + lead.email} className="text-blue-600">
                {lead.email}
              </a>
            </div>
          )}
          {lead.website && (
            <div>
              <span className="text-gray-500">Web:</span>{' '}
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 truncate"
              >
                {lead.website}
              </a>
            </div>
          )}
          {lead.instagram && (
            <div>
              <span className="text-gray-500">IG:</span>{' '}
              <a
                href={lead.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600"
              >
                Instagram
              </a>
            </div>
          )}
          {lead.facebook && (
            <div>
              <span className="text-gray-500">FB:</span>{' '}
              <a
                href={lead.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600"
              >
                Facebook
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-2">Score</h2>
        <ScoreBreakdown factorScores={factorScores} totalScore={lead.total_score} />
        <p className="text-sm text-gray-600 mt-3 italic">{lead.reasoning}</p>
        {reviewsData.length > 0 && (
          <div className="mt-3">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Review Snippets</h3>
            <div className="space-y-1">
              {reviewsData.slice(0, 5).map((r: any, i: number) => (
                <p key={i} className="text-xs text-gray-500">
                  ({r.review_rating}/5) {r.review_text}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>

      {drafts.length > 0 && (
        <section className="bg-white border rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-2">Outreach</h2>
          <OutreachEditor drafts={drafts} leadId={lead.id} />
        </section>
      )}

      <section className="bg-white border rounded-lg p-4">
        <NotesSection leadId={lead.id} initialNotes={notes} />
      </section>
    </div>
  );
}
