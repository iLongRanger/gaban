import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

describe('presets table', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('inserts and retrieves a preset', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'Test Preset', 'Vancouver, BC', 30, 49.2, -123.1, '["restaurants"]', 4, now, now
    );
    const preset = db.prepare('SELECT * FROM presets WHERE name = ?').get('Test Preset');
    assert.strictEqual(preset.name, 'Test Preset');
    assert.strictEqual(preset.location, 'Vancouver, BC');
    assert.strictEqual(preset.radius_km, 30);
  });

  it('enforces unique preset names', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run('Dupe', 'A', 50, 49, -123, '[]', 4, now, now);
    assert.throws(() => {
      stmt.run('Dupe', 'B', 50, 49, -123, '[]', 4, now, now);
    });
  });

  it('is_default clears others in transaction', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run('A', 'X', 50, 49, -123, '[]', 4, 1, now, now);
    stmt.run('B', 'Y', 50, 49, -123, '[]', 4, 0, now, now);

    const setDefault = db.transaction((id) => {
      db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
      db.prepare('UPDATE presets SET is_default = 1 WHERE id = ?').run(id);
    });

    const presetB = db.prepare('SELECT id FROM presets WHERE name = ?').get('B');
    setDefault(presetB.id);

    const a = db.prepare('SELECT is_default FROM presets WHERE name = ?').get('A');
    const b = db.prepare('SELECT is_default FROM presets WHERE name = ?').get('B');
    assert.strictEqual(a.is_default, 0);
    assert.strictEqual(b.is_default, 1);
  });

  it('ON DELETE SET NULL for pipeline_runs', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'X', 50, 49, -123, '[]', 4, now, now);
    const preset = db.prepare('SELECT id FROM presets WHERE name = ?').get('P');
    db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'completed', ?)`).run(preset.id, now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const run = db.prepare('SELECT preset_id FROM pipeline_runs').get();
    assert.strictEqual(run.preset_id, null);
  });

  it('ON DELETE CASCADE for schedules', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'X', 50, 49, -123, '[]', 4, now, now);
    const preset = db.prepare('SELECT id FROM presets WHERE name = ?').get('P');
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, '0 9 * * 1', ?)`).run(preset.id, now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM schedules').get();
    assert.strictEqual(count.c, 0);
  });
});
