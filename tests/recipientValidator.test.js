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
