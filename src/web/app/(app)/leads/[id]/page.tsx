import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db.js';
import ScoreBreakdown from '@/components/ScoreBreakdown';
import OutreachEditor from '@/components/OutreachEditor';
import NotesSection from '@/components/NotesSection';
import StatusDropdown from '@/components/StatusDropdown';

export const dynamic = 'force-dynamic';

function ContactRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
      <span className="label">{label}</span>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
           style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13, textDecoration: 'none', wordBreak: 'break-all' }}>
          {value}
        </a>
      ) : (
        <span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{value}</span>
      )}
    </div>
  );
}

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
    <div className="boot" style={{ maxWidth: 920 }}>
      <Link
        href="/"
        className="label"
        style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18 }}
      >
        ← BACK TO FEED
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            DOSSIER · ID/{String(lead.id).padStart(4, '0')} · {lead.week}
          </div>
          <h1 style={{ fontSize: 30, margin: 0, lineHeight: 1.15 }}>{lead.business_name}</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
            {lead.type || 'UNCLASSIFIED'} · {lead.address || '—'} · {Number(lead.distance_km || 0).toFixed(1)} km
          </p>
        </div>
        <StatusDropdown leadId={lead.id} initialStatus={lead.status} />
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <section className="frame frame--brackets" style={{ padding: '18px 20px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 6 }}>CONTACT VECTORS</div>
          {lead.phone   && <ContactRow label="PHONE"     value={lead.phone}     href={'tel:' + lead.phone} />}
          {lead.email   && <ContactRow label="EMAIL"     value={lead.email}     href={'mailto:' + lead.email} />}
          {lead.website && <ContactRow label="WEBSITE"   value={lead.website}   href={lead.website} />}
          {lead.instagram && <ContactRow label="INSTAGRAM" value={lead.instagram} href={lead.instagram} />}
          {lead.facebook  && <ContactRow label="FACEBOOK"  value={lead.facebook}  href={lead.facebook} />}
          {!lead.phone && !lead.email && !lead.website && !lead.instagram && !lead.facebook && (
            <p style={{ color: 'var(--mute)', fontSize: 13, marginTop: 8 }}>No contact channels recorded.</p>
          )}
        </section>

        <section className="frame frame--brackets" style={{ padding: '18px 20px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 14 }}>SCORE ANALYSIS</div>
          <ScoreBreakdown factorScores={factorScores} totalScore={lead.total_score} />
          {lead.reasoning && (
            <>
              <hr className="hr-fade" style={{ margin: '16px 0 12px' }} />
              <div className="label" style={{ marginBottom: 6 }}>RATIONALE</div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>{lead.reasoning}</p>
            </>
          )}
        </section>
      </div>

      {reviewsData.length > 0 && (
        <section className="frame frame--brackets" style={{ padding: '18px 20px', marginTop: 18 }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 12 }}>REVIEW INTERCEPTS · N={reviewsData.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviewsData.slice(0, 5).map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                <span className="numeric label" style={{ color: 'var(--accent)', minWidth: 36 }}>
                  {r.review_rating}/5
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.review_text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="frame frame--brackets" style={{ padding: '18px 20px', marginTop: 18 }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ marginBottom: 12 }}>OUTREACH DRAFTS · N={drafts.length}</div>
          <OutreachEditor drafts={drafts} leadId={lead.id} />
        </section>
      )}

      <section className="frame frame--brackets" style={{ padding: '18px 20px', marginTop: 18 }}>
        <span className="br-tr" /><span className="br-bl" />
        <div className="label" style={{ marginBottom: 12 }}>OPERATOR NOTES</div>
        <NotesSection leadId={lead.id} initialNotes={notes} />
      </section>
    </div>
  );
}
