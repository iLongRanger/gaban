import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipientValidator } from '../src/services/recipientValidator.js';

function fakeResolver({ ok = new Set(), throwFor = new Set() } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    resolveMx: async (domain) => {
      calls += 1;
      if (throwFor.has(domain)) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      if (ok.has(domain)) return [{ exchange: 'mx.example.com', priority: 10 }];
      return [];
    },
  };
}

test('rejects syntactically invalid emails without DNS lookup', async () => {
  const dns = fakeResolver();
  const v = new RecipientValidator({ dns });
  const result = await v.validate('not-an-email');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_syntax');
  assert.equal(dns.calls(), 0);
});

test('rejects domains with no MX record', async () => {
  const dns = fakeResolver({ ok: new Set() });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('hello@nowhere.invalid');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'no_mx_records');
});

test('rejects domains where MX lookup throws ENOTFOUND', async () => {
  const dns = fakeResolver({ throwFor: new Set(['nx.example']) });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('hello@nx.example');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'domain_not_found');
});

function throwingResolver(code) {
  let calls = 0;
  return {
    calls: () => calls,
    resolveMx: async () => {
      calls += 1;
      throw Object.assign(new Error(code), { code });
    },
  };
}

// A resolver that cannot answer is not the same as a domain that does not exist.
// Treating the former as permanent silently drops leads whenever the network blips.
test('marks transient DNS failures as retryable', async () => {
  const dns = throwingResolver('EAI_AGAIN');
  const v = new RecipientValidator({ dns });
  const result = await v.validate('owner@real-domain.com');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'mx_lookup_failed');
  assert.equal(result.retryable, true);
});

test('does not mark a missing domain as retryable', async () => {
  const dns = throwingResolver('ENOTFOUND');
  const v = new RecipientValidator({ dns });
  const result = await v.validate('owner@nx.example');
  assert.equal(result.reason, 'domain_not_found');
  assert.equal(result.retryable, false);
});

// Caching a network error poisons the domain for the whole TTL.
test('does not cache transient DNS failures', async () => {
  const dns = throwingResolver('ETIMEDOUT');
  const v = new RecipientValidator({ dns });
  await v.validate('a@flaky.example');
  await v.validate('b@flaky.example');
  assert.equal(dns.calls(), 2);
});

test('accepts emails on domains with MX records', async () => {
  const dns = fakeResolver({ ok: new Set(['gleampro.ca']) });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('owner@gleampro.ca');
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test('caches MX lookups by domain', async () => {
  const dns = fakeResolver({ ok: new Set(['cached.example']) });
  const v = new RecipientValidator({ dns });
  await v.validate('a@cached.example');
  await v.validate('b@cached.example');
  await v.validate('c@cached.example');
  assert.equal(dns.calls(), 1);
});

test('cache entries expire after ttlMs', async () => {
  const dns = fakeResolver({ ok: new Set(['t.example']) });
  let now = 1_000_000;
  const v = new RecipientValidator({ dns, ttlMs: 100, now: () => now });
  await v.validate('a@t.example');
  now += 200;
  await v.validate('a@t.example');
  assert.equal(dns.calls(), 2);
});
