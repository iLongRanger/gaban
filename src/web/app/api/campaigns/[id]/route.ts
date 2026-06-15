import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { CampaignService } from '../../../../../services/campaignService.js';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { send_window_start: sendWindowStart, send_window_end: sendWindowEnd } = body || {};

  const db = getDb();
  try {
    const campaign = new CampaignService({ db }).updateSendWindow(Number(id), {
      sendWindowStart,
      sendWindowEnd,
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found or finished' }, { status: 404 });
    }
    return NextResponse.json(campaign);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
