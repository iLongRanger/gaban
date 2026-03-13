import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

describe('schedules table', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Test', 'Vancouver', 30, 49.2, -123.1, '["restaurants"]', 4, now, now);
  });

  it('creates a schedule for a preset', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, ?, ?)`).run(preset.id, '0 9 * * 1', now);
    const schedule = db.prepare('SELECT * FROM schedules').get();
    assert.strictEqual(schedule.cron, '0 9 * * 1');
    assert.strictEqual(schedule.enabled, 1);
  });

  it('cascades delete when preset is removed', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, ?, ?)`).run(preset.id, '0 9 * * 1', now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM schedules').get();
    assert.strictEqual(count.c, 0);
  });
});
