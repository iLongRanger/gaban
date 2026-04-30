function hasGmailEnv(env) {
  return Boolean(
    env.GMAIL_OAUTH_CLIENT_ID &&
    env.GMAIL_OAUTH_CLIENT_SECRET &&
    env.GMAIL_OAUTH_REFRESH_TOKEN &&
    env.GMAIL_SENDER_EMAIL
  );
}

function writeSetting(db, key, value, at) {
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), at.toISOString());
}

export class HealthCheckService {
  constructor({ db, env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  checkDbWritable(now) {
    writeSetting(this.db, 'outreach.healthcheck_probe', now.toISOString(), now);
    return true;
  }

  async checkPublicUrl() {
    if (!this.env.PUBLIC_APP_URL || !this.fetchImpl) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await this.fetchImpl(this.env.PUBLIC_APP_URL, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return Boolean(response?.ok);
    } catch (err) {
      this.logger.warn?.(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async run({ now = new Date() } = {}) {
    const dbWritable = this.checkDbWritable(now);
    const gmailConfigured = hasGmailEnv(this.env);
    const publicUrlOk = await this.checkPublicUrl();
    const ok = dbWritable && gmailConfigured && publicUrlOk !== false;
    const result = {
      ok,
      checked_at: now.toISOString(),
      db_writable: dbWritable,
      gmail_configured: gmailConfigured,
      public_url: this.env.PUBLIC_APP_URL || null,
      public_url_ok: publicUrlOk,
    };

    writeSetting(this.db, 'outreach.last_healthcheck', JSON.stringify(result), now);
    return result;
  }
}
