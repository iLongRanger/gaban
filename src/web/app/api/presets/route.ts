import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { ALL_CATEGORIES } from '../../../../config/categories.js';

export function GET() {
  const db = getDb();
  const presets = db.prepare('SELECT * FROM presets ORDER BY created_at DESC').all();
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const { name, location, radius_km, office_lat, office_lng, categories, top_n, is_default } = body;

  if (!name || !location || !categories || !Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'name, location, and categories are required' }, { status: 400 });
  }

  const invalid = categories.filter((c: string) => !ALL_CATEGORIES.includes(c));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown categories: ${invalid.join(', ')}` }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    const insert = db.transaction(() => {
      if (is_default) {
        db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
      }
      return db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, location,
        radius_km ?? 50,
        office_lat ?? 49.2026,
        office_lng ?? -122.9106,
        JSON.stringify(categories),
        top_n ?? 4,
        is_default ? 1 : 0,
        now, now
      );
    });

    const result = insert();
    const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(preset, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'A preset with that name already exists' }, { status: 409 });
    }
    throw err;
  }
}
