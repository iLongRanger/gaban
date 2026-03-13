import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { startRun } from '@/lib/pipelineRunner';

export function GET(request: NextRequest) {
  const db = getDb();
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  const runs = db.prepare(
    `SELECT r.*, p.name as preset_name
     FROM pipeline_runs r
     LEFT JOIN presets p ON r.preset_id = p.id
     ORDER BY r.started_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);

  const total = (db.prepare('SELECT COUNT(*) as count FROM pipeline_runs').get() as any).count;

  return NextResponse.json({ runs, total, page, limit });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset_id } = body;

  if (!preset_id) {
    return NextResponse.json({ error: 'preset_id is required' }, { status: 400 });
  }

  const result = startRun(preset_id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ run_id: result.runId }, { status: 201 });
}
