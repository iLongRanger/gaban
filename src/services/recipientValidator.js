import { promises as defaultDns } from 'node:dns';

const SYNTAX = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

export class RecipientValidator {
  constructor({ dns = defaultDns, ttlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.dns = dns;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  async validate(email) {
    const value = String(email || '').trim();
    if (!SYNTAX.test(value)) return { valid: false, reason: 'invalid_syntax' };
    const domain = value.split('@')[1].toLowerCase();

    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > this.now()) {
      return cached.result.valid
        ? { valid: true, reason: null }
        : { valid: false, reason: cached.result.reason };
    }

    let result;
    try {
      const records = await this.dns.resolveMx(domain);
      result = records?.length
        ? { valid: true, reason: null }
        : { valid: false, reason: 'no_mx_records' };
    } catch (err) {
      const code = err?.code || '';
      const reason = code === 'ENOTFOUND' || code === 'ENODATA' ? 'domain_not_found' : 'mx_lookup_failed';
      result = { valid: false, reason };
    }

    this.cache.set(domain, { result, expiresAt: this.now() + this.ttlMs });
    return result;
  }
}

export default RecipientValidator;
