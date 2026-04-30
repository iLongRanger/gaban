import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { SuppressionService } from '../src/services/suppressionService.js';

describe('SuppressionService', () => {
  let db, svc;

  beforeEach(() => {
    db = initDb(':memory:');
    svc = new SuppressionService({ db });
  });

  afterEach(() => {
    db.close();
  });

  it('isSuppressed returns false for unknown email', () => {
    assert.strictEqual(svc.isSuppressed('unknown@example.com'), false);
  });

  it('add + isSuppressed round trip (case-insensitive)', () => {
    svc.add({ email: 'Foo@Example.COM', reason: 'unsubscribed', source: 'click' });
    assert.strictEqual(svc.isSuppressed('foo@example.com'), true);
    assert.strictEqual(svc.isSuppressed('FOO@example.com'), true);
  });

  it('add is idempotent (same email twice does not throw)', () => {
    svc.add({ email: 'a@b.com', reason: 'unsubscribed', source: 'click' });
    svc.add({ email: 'a@b.com', reason: 'unsubscribed', source: 'click' });
    const count = db.prepare('SELECT COUNT(*) as c FROM suppression_list').get();
    assert.strictEqual(count.c, 1);
  });

  it('domain wildcard suppresses all addresses at that domain', () => {
    svc.addDomain({ domain: 'blocked.com', reason: 'manual', source: 'operator' });
    assert.strictEqual(svc.isSuppressed('anyone@blocked.com'), true);
    assert.strictEqual(svc.isSuppressed('someone@otherdomain.com'), false);
  });

  it('rejects malformed emails', () => {
    assert.throws(() => svc.add({ email: 'not-an-email', reason: 'x', source: 'y' }),
      /invalid email/i);
    assert.throws(() => svc.add({ email: '', reason: 'x', source: 'y' }),
      /invalid email/i);
  });

  it('requires reason and source', () => {
    assert.throws(() => svc.add({ email: 'a@b.com', source: 'x' }), /reason/i);
    assert.throws(() => svc.add({ email: 'a@b.com', reason: 'x' }), /source/i);
  });

  it('lists and removes suppressions', () => {
    svc.add({ email: 'a@b.com', reason: 'manual', source: 'operator' });
    svc.addDomain({ domain: 'blocked.com', reason: 'manual', source: 'operator' });

    const rows = svc.list();
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows.map((row) => row.kind).sort(), ['domain', 'email']);

    assert.strictEqual(svc.remove(rows[0].id), true);
    assert.strictEqual(svc.list().length, 1);
  });
});
