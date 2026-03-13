import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();

  if (!body.lead_id || !body.content) {
    return NextResponse.json({ error: 'lead_id and content required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO lead_notes (lead_id, content, created_at) VALUES (?, ?, ?)'
  ).run(body.lead_id, body.content, now);

  const note = db.prepare('SELECT * FROM lead_notes WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(note, { status: 201 });
}
