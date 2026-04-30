import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { SystemSettingsService } from '../src/services/systemSettingsService.js';

describe('SystemSettingsService', () => {
  let db;
  let service;

  beforeEach(() => {
    db = initDb(':memory:');
    service = new SystemSettingsService({ db });
  });

  it('upserts and reads selected settings', () => {
    service.updateSettings({
      'outreach.daily_cap': '10',
      'outreach.warmup_start_date': '2026-05-04',
    });
    service.updateSettings({ 'outreach.daily_cap': '15' });

    assert.deepStrictEqual(service.getSettings([
      'outreach.daily_cap',
      'outreach.warmup_start_date',
    ]), {
      'outreach.daily_cap': '15',
      'outreach.warmup_start_date': '2026-05-04',
    });
  });

  it('deletes blank settings', () => {
    service.updateSettings({ 'outreach.daily_cap': '10' });
    service.updateSettings({ 'outreach.daily_cap': '' });

    assert.deepStrictEqual(service.getSettings(['outreach.daily_cap']), {});
  });
});
