import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { SystemSettingsService } from '../../../../../services/systemSettingsService.js';

const DAILY_CAP_KEY = 'outreach.daily_cap';
const WARMUP_START_KEY = 'outreach.warmup_start_date';
const WARMUP_LADDER_KEY = 'outreach.warmup_ladder';
const KEYS = [DAILY_CAP_KEY, WARMUP_START_KEY, WARMUP_LADDER_KEY];

function toResponse(settings: Record<string, string>) {
  return {
    daily_cap: settings[DAILY_CAP_KEY] ?? '',
    warmup_start_date: settings[WARMUP_START_KEY] ?? '',
    warmup_ladder: settings[WARMUP_LADDER_KEY]
      ? JSON.parse(settings[WARMUP_LADDER_KEY]).join(',')
      : '',
  };
}

function parsePositiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return '';
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${field} must be a positive whole number`);
  }
  return String(numberValue);
}

function parseDate(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('warmup_start_date must use YYYY-MM-DD');
  }
  return value;
}

function parseLadder(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const caps = rawValues.map((item) => Number(String(item).trim()));
  if (caps.length === 0 || caps.some((cap) => !Number.isInteger(cap) || cap < 1)) {
    throw new Error('warmup_ladder must contain positive whole numbers');
  }
  return JSON.stringify(caps);
}

export function GET() {
  const db = getDb();
  const settings = new SystemSettingsService({ db }).getSettings(KEYS);
  return NextResponse.json(toResponse(settings));
}

export async function PATCH(request: NextRequest) {
  const db = getDb();
  const body = await request.json();

  try {
    const values = {
      [DAILY_CAP_KEY]: parsePositiveInteger(body.daily_cap, 'daily_cap'),
      [WARMUP_START_KEY]: parseDate(body.warmup_start_date),
      [WARMUP_LADDER_KEY]: parseLadder(body.warmup_ladder),
    };
    const service = new SystemSettingsService({ db });
    service.updateSettings(values);
    return NextResponse.json(toResponse(service.getSettings(KEYS)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
