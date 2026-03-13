import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { registerSchedule } from '@/lib/scheduler';
import cron from 'node-cron';

export function GET() {
  const db = getDb();
  const schedules = db.prepare(
    `SELECT s.*, p.name as preset_name
     FROM schedules s
     JOIN presets p ON s.preset_id = p.id
     ORDER BY s.created_at DESC`
  ).all();
  return NextResponse.json(schedules);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const { preset_id, cron: cronExpr, enabled } = body;

  if (!preset_id || !cronExpr) {
    return NextResponse.json({ error: 'preset_id and cron are required' }, { status: 400 });
  }

  if (!cron.validate(cronExpr)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const preset = db.prepare('SELECT id FROM presets WHERE id = ?').get(preset_id);
  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO schedules (preset_id, cron, enabled, created_at) VALUES (?, ?, ?, ?)'
  ).run(preset_id, cronExpr, enabled !== false ? 1 : 0, now);

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);

  if (enabled !== false) {
    registerSchedule(Number(result.lastInsertRowid), cronExpr, preset_id);
  }

  return NextResponse.json(schedule, { status: 201 });
}
