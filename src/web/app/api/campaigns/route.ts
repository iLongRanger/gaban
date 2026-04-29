import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { CampaignService } from '../../../../services/campaignService.js';

export function GET() {
  const db = getDb();
  const campaigns = db.prepare(
    `SELECT c.*, p.name AS preset_name,
            COUNT(DISTINCT cl.id) AS lead_count,
            SUM(CASE WHEN es.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
            SUM(CASE WHEN es.status = 'sent' THEN 1 ELSE 0 END) AS sent_count
     FROM campaigns c
     JOIN presets p ON p.id = c.preset_id
     LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
     LEFT JOIN email_sends es ON es.campaign_lead_id = cl.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all();
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const presetId = Number(body.preset_id);
  const leadIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.map((id: unknown) => Number(id)).filter(Number.isFinite)
    : [];
  const dailyCap = body.daily_cap === undefined ? 5 : Number(body.daily_cap);

  if (!presetId) {
    return NextResponse.json({ error: 'preset_id is required' }, { status: 400 });
  }
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (leadIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one lead' }, { status: 400 });
  }
  if (!Number.isFinite(dailyCap) || dailyCap < 0) {
    return NextResponse.json({ error: 'daily_cap must be zero or greater' }, { status: 400 });
  }

  try {
    const campaign = new CampaignService({ db }).createCampaign({
      presetId,
      name: body.name.trim(),
      leadIds,
      startAt: body.start_at || new Date().toISOString(),
      dailyCap,
      touchStyles: ['curious_neighbor', 'value_lead', 'compliment_question'],
      status: 'active',
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create campaign';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
