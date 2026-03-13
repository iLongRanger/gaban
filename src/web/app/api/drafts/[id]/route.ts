import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  if (body.edited_email_body !== undefined) {
    db.prepare('UPDATE outreach_drafts SET edited_email_body = ?, updated_at = ? WHERE id = ?')
      .run(body.edited_email_body, now, id);
  }
  if (body.edited_dm !== undefined) {
    db.prepare('UPDATE outreach_drafts SET edited_dm = ?, updated_at = ? WHERE id = ?')
      .run(body.edited_dm, now, id);
  }
  if (body.selected !== undefined) {
    const draft = db.prepare('SELECT lead_id FROM outreach_drafts WHERE id = ?').get(id) as any;
    if (draft) {
      db.prepare('UPDATE outreach_drafts SET selected = 0, updated_at = ? WHERE lead_id = ?')
        .run(now, draft.lead_id);
      db.prepare('UPDATE outreach_drafts SET selected = 1, updated_at = ? WHERE id = ?')
        .run(now, id);
    }
  }
  if (body.reset) {
    db.prepare(
      'UPDATE outreach_drafts SET edited_email_body = NULL, edited_dm = NULL, updated_at = ? WHERE id = ?'
    ).run(now, id);
  }

  const updated = db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(id);
  return NextResponse.json(updated);
}
