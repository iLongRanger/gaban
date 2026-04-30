import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { OutcomeService } from '../../../../../../services/outcomeService.js';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const campaignLeadId = Number(id);
  const service = new (OutcomeService as any)({ db: getDb() });

  try {
    if (body.type === 'meeting') {
      return NextResponse.json(service.logMeeting({
        campaignLeadId,
        scheduledFor: body.scheduled_for,
        kind: body.kind,
        notes: body.notes,
      }), { status: 201 });
    }
    if (body.type === 'contract') {
      return NextResponse.json(service.logContract({
        campaignLeadId,
        signedDate: body.signed_date,
        valueMonthly: body.value_monthly === '' ? null : Number(body.value_monthly),
        notes: body.notes,
      }), { status: 201 });
    }
    if (body.type === 'disposition') {
      return NextResponse.json(service.logDisposition({
        campaignLeadId,
        outcome: body.outcome,
        notes: body.notes,
      }));
    }
    return NextResponse.json({ error: 'type must be meeting, contract, or disposition' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to log outcome';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
