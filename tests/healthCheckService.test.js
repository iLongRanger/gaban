import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { HealthCheckService } from '../src/services/healthCheckService.js';

describe('HealthCheckService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('records a passing health check', async () => {
    const result = await new HealthCheckService({
      db,
      env: {
        GMAIL_OAUTH_CLIENT_ID: 'id',
        GMAIL_OAUTH_CLIENT_SECRET: 'secret',
        GMAIL_OAUTH_REFRESH_TOKEN: 'refresh',
        GMAIL_SENDER_EMAIL: 'outreach@example.com',
        PUBLIC_APP_URL: 'https://bot.example.com',
      },
      fetchImpl: async () => ({ ok: true }),
      logger: {},
    }).run({ now: new Date('2026-05-04T16:00:00.000Z') });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.public_url_ok, true);
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'outreach.last_healthcheck'").get();
    assert.ok(setting.value.includes('"ok":true'));
  });

  it('fails when Gmail env is incomplete or public URL fails', async () => {
    const result = await new HealthCheckService({
      db,
      env: { PUBLIC_APP_URL: 'https://bot.example.com' },
      fetchImpl: async () => ({ ok: false }),
      logger: {},
    }).run({ now: new Date('2026-05-04T16:00:00.000Z') });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.gmail_configured, false);
    assert.strictEqual(result.public_url_ok, false);
  });
});
