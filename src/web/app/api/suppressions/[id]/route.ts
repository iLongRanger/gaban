import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { SuppressionService } from '../../../../../services/suppressionService.js';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = new (SuppressionService as any)({ db: getDb() });
  const removed = service.remove(Number(id));
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
