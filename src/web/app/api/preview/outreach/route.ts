import '@/lib/loadEnv.js';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import DraftingService from '../../../../../services/draftingService.js';
import { UsageService } from '../../../../../services/usageService.js';
import {
  PREVIEW_BUSINESS_TYPES,
  buildPreviewLead,
} from '../../../../../services/previewLeadBuilder.js';
import { classifyVertical } from '../../../../../services/verticalClassifier.js';

export const dynamic = 'force-dynamic';

type PreviewType = { id: string; label: string; vertical: string };

// GET → the selectable business types (so the client never duplicates the list).
export function GET() {
  const types = (PREVIEW_BUSINESS_TYPES as PreviewType[]).map(({ id, label, vertical }) => ({
    id,
    label,
    vertical,
  }));
  return NextResponse.json({ types });
}

// POST { businessType } → live-generate the 5-touch sequence a lead of that type would get.
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set on the server, so previews cannot be generated.' },
      { status: 400 }
    );
  }

  let body: { businessType?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const businessType = body?.businessType;
  const known = (PREVIEW_BUSINESS_TYPES as PreviewType[]).some((t) => t.id === businessType);
  if (!businessType || !known) {
    return NextResponse.json({ error: 'Unknown business type.' }, { status: 400 });
  }

  const lead = (buildPreviewLead as (id: string) => Record<string, unknown>)(businessType);

  const Drafting = DraftingService as unknown as new (opts: unknown) => {
    draftOutreach: (lead: unknown) => Promise<Record<string, unknown>>;
  };
  const Usage = UsageService as unknown as new (opts: unknown) => unknown;

  const drafting = new Drafting({
    apiKey: process.env.OPENAI_API_KEY,
    // Record the token spend so previews show up on the Usage page like any other API call.
    usageRecorder: new Usage({ db: getDb() }),
  });

  const drafts = await drafting.draftOutreach(lead);
  if (drafts?.error) {
    return NextResponse.json({ error: String(drafts.error) }, { status: 502 });
  }

  const vertical = (classifyVertical as (lead: unknown) => string)(lead);
  return NextResponse.json({ vertical, drafts });
}
