import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken
} from '../src/services/unsubscribeTokenService.js';

const SECRET = 'test-secret-do-not-use-in-prod';

describe('unsubscribeTokenService', () => {
  it('round-trips a send id', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    const payload = verifyUnsubscribeToken(token, SECRET);
    assert.strictEqual(payload.sendId, 42);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    assert.throws(() => verifyUnsubscribeToken(token, 'different-secret'),
      /invalid signature/i);
  });

  it('rejects a tampered payload', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    const [payloadB64, sig] = token.split('.');
    const tampered = Buffer.from(payloadB64, 'base64url').toString('utf8')
      .replace('42', '99');
    const tamperedToken = Buffer.from(tampered).toString('base64url') + '.' + sig;
    assert.throws(() => verifyUnsubscribeToken(tamperedToken, SECRET),
      /invalid signature/i);
  });

  it('rejects a malformed token', () => {
    assert.throws(() => verifyUnsubscribeToken('not-a-token', SECRET),
      /malformed/i);
    assert.throws(() => verifyUnsubscribeToken('', SECRET),
      /malformed/i);
  });

  it('produces urlsafe tokens (no +, /, =)', () => {
    const token = signUnsubscribeToken({ sendId: 1 }, SECRET);
    assert.ok(!/[+/=]/.test(token), 'token contains URL-unsafe characters');
  });
});
