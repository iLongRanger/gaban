import '@/lib/loadEnv.js';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { MetricsService } from '../../../../../services/metricsService.js';

export function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get('since')
    || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const Metrics = MetricsService as any;
  const metrics = new Metrics({ db: getDb() });
  return NextResponse.json({
    ...metrics.outreachFunnel({ since }),
    ab: metrics.abComparison({ since }),
  });
}
