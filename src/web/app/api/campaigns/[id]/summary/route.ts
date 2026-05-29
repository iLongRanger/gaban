import '@/lib/loadEnv.js';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { MetricsService } from '../../../../../../services/metricsService.js';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const Metrics = MetricsService as any;
  const summary = new Metrics({ db: getDb() }).campaignSummary(Number(id), { now: new Date() });
  if (!summary) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json(summary);
}
