import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const run = db.prepare(
    `SELECT r.*, p.name as preset_name
     FROM pipeline_runs r
     LEFT JOIN presets p ON r.preset_id = p.id
     WHERE r.id = ?`
  ).get(id);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  return NextResponse.json(run);
}
