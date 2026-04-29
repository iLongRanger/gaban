import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { CampaignService } from '../../../../../../services/campaignService.js';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const ok = new CampaignService({ db }).resumeCampaign(Number(id));
  if (!ok) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
