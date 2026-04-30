import crypto from 'node:crypto';

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length < 3) return false;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  if (at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return false;
  return true;
}

export class SuppressionService {
  constructor({ db }) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  isSuppressed(email) {
    if (!isValidEmail(email)) return false;
    const hash = hashEmail(email);
    const byHash = this.db.prepare(
      'SELECT 1 FROM suppression_list WHERE email_hash = ? LIMIT 1'
    ).get(hash);
    if (byHash) return true;

    const domain = email.toLowerCase().trim().split('@')[1];
    const byDomain = this.db.prepare(
      'SELECT 1 FROM suppression_list WHERE email_hash IS NULL AND domain = ? LIMIT 1'
    ).get(domain);
    return !!byDomain;
  }

  add({ email, reason, source }) {
    if (!isValidEmail(email)) throw new Error(`invalid email: ${email}`);
    if (!reason) throw new Error('reason required');
    if (!source) throw new Error('source required');
    const hash = hashEmail(email);
    const domain = email.toLowerCase().trim().split('@')[1];
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR IGNORE INTO suppression_list (email_hash, domain, reason, source, added_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(hash, domain, reason, source, now);
  }

  addDomain({ domain, reason, source }) {
    if (!domain || typeof domain !== 'string') throw new Error('domain required');
    if (!reason) throw new Error('reason required');
    if (!source) throw new Error('source required');
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR IGNORE INTO suppression_list (email_hash, domain, reason, source, added_at)
      VALUES (NULL, ?, ?, ?, ?)`
    ).run(domain.toLowerCase().trim(), reason, source, now);
  }

  list({ limit = 100 } = {}) {
    return this.db.prepare(
      `SELECT id,
              CASE WHEN email_hash IS NULL THEN 'domain' ELSE 'email' END AS kind,
              email_hash,
              domain,
              reason,
              source,
              added_at
       FROM suppression_list
       ORDER BY added_at DESC, id DESC
       LIMIT ?`
    ).all(limit);
  }

  remove(id) {
    return this.db.prepare('DELETE FROM suppression_list WHERE id = ?').run(id).changes > 0;
  }
}
