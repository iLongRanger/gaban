import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb } from '../src/web/lib/db.js';
import { BackupService } from '../src/services/backupService.js';

describe('BackupService', () => {
  let db;
  let backupDir;

  beforeEach(() => {
    db = initDb(':memory:');
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaban-backups-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('creates one backup per day and records settings', async () => {
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('P', 'New Westminster', 10, 49.2, -123.1, '[]', 5, '2026-05-04T16:00:00.000Z', '2026-05-04T16:00:00.000Z');

    const service = new BackupService({ db, backupDir, logger: {} });
    const first = await service.createDailyBackup({ now: new Date('2026-05-04T16:00:00.000Z') });
    const second = await service.createDailyBackup({ now: new Date('2026-05-04T17:00:00.000Z') });

    assert.strictEqual(first.created, true);
    assert.strictEqual(second.created, false);
    assert.strictEqual(fs.existsSync(first.path), true);
    assert.strictEqual(path.basename(first.path), '2026-05-04.sqlite');
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'outreach.last_backup_path'").get();
    assert.strictEqual(setting.value, first.path);
  });
});
