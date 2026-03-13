import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

describe('pipeline runner DB operations', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Test', 'Vancouver', 30, 49.2, -123.1, '["restaurants"]', 4, now, now);
  });

  it('creates a pipeline_runs row with running status', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'running', ?)`).run(preset.id, now);
    const run = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(result.lastInsertRowid);
    assert.strictEqual(run.status, 'running');
    assert.strictEqual(run.preset_id, preset.id);
  });

  it('detects concurrent run via status check', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'running', ?)`).run(preset.id, now);
    const active = db.prepare("SELECT id FROM pipeline_runs WHERE status = 'running'").get();
    assert.ok(active, 'Should find an active run');
  });

  it('appends to log column', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO pipeline_runs (preset_id, status, log, started_at) VALUES (?, 'running', '', ?)`).run(preset.id, now);
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run('line 1\n', result.lastInsertRowid);
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run('line 2\n', result.lastInsertRowid);
    const run = db.prepare('SELECT log FROM pipeline_runs WHERE id = ?').get(result.lastInsertRowid);
    assert.strictEqual(run.log, 'line 1\nline 2\n');
  });
});
