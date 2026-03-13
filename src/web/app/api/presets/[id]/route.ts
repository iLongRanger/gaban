import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { ALL_CATEGORIES } from '../../../../../config/categories.js';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }
  return NextResponse.json(preset);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, location, radius_km, office_lat, office_lng, categories, top_n, is_default } = body;

  if (categories) {
    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: 'categories must be a non-empty array' }, { status: 400 });
    }
    const invalid = categories.filter((c: string) => !ALL_CATEGORIES.includes(c));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Unknown categories: ${invalid.join(', ')}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  const update = db.transaction(() => {
    if (is_default) {
      db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
    }
    db.prepare(`UPDATE presets SET
      name = ?, location = ?, radius_km = ?, office_lat = ?, office_lng = ?,
      categories = ?, top_n = ?, is_default = ?, updated_at = ?
      WHERE id = ?`).run(
      name ?? existing.name,
      location ?? existing.location,
      radius_km ?? existing.radius_km,
      office_lat ?? existing.office_lat,
      office_lng ?? existing.office_lng,
      categories ? JSON.stringify(categories) : existing.categories,
      top_n ?? existing.top_n,
      is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
      now, id
    );
  });

  update();
  const updated = db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
