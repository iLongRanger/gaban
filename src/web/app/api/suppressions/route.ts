import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { SuppressionService } from '../../../../services/suppressionService.js';

export function GET() {
  const service = new (SuppressionService as any)({ db: getDb() });
  return NextResponse.json(service.list());
}

export async function POST(request: NextRequest) {
  const service = new (SuppressionService as any)({ db: getDb() });
  const body = await request.json();
  const reason = body.reason || 'manual';
  const source = 'operator';

  try {
    if (body.kind === 'domain') {
      service.addDomain({ domain: body.value, reason, source });
    } else {
      service.add({ email: body.value, reason, source });
    }
    return NextResponse.json(service.list(), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add suppression';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
