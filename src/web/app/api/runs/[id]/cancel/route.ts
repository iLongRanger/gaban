import { NextRequest, NextResponse } from 'next/server';
import { cancelRun } from '@/lib/pipelineRunner';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = cancelRun(parseInt(id));

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
