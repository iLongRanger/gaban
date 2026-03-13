import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = ?').all(id);
  const notes = db.prepare(
    'SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC'
  ).all(id);

  return NextResponse.json({ ...(lead as object), drafts, notes });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  if (body.status) {
    const allowed = ['new', 'contacted', 'interested', 'rejected', 'closed'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?')
      .run(body.status, new Date().toISOString(), id);
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  return NextResponse.json(lead);
}
