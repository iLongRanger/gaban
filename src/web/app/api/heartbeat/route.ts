import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { HeartbeatService } from '../../../../services/heartbeatService.js';

export function GET() {
  const db = getDb();
  const Heartbeat = HeartbeatService as any;
  return NextResponse.json(new Heartbeat({ db }).snapshot());
}
