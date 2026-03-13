import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { registerSchedule, unregisterSchedule } from '@/lib/scheduler';
import cron from 'node-cron';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  const body = await request.json();
  const { cron: cronExpr, enabled } = body;

  if (cronExpr && !cron.validate(cronExpr)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const newCron = cronExpr ?? existing.cron;
  const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;

  db.prepare('UPDATE schedules SET cron = ?, enabled = ? WHERE id = ?').run(newCron, newEnabled, id);

  if (newEnabled) {
    registerSchedule(Number(id), newCron, existing.preset_id);
  } else {
    unregisterSchedule(Number(id));
  }

  const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  unregisterSchedule(Number(id));
  const result = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
