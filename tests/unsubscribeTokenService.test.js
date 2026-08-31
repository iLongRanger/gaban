import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  signOpenToken,
  verifyOpenToken
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

  // Splitting on '.' and taking the first two parts would quietly accept
  // anything appended to a valid token, so one leaked token would yield an
  // unlimited family of distinct URLs that all still verify.
  it('rejects a token with trailing segments appended', () => {
    const token = signUnsubscribeToken({ sendId: 42 }, SECRET);
    assert.throws(() => verifyUnsubscribeToken(`${token}.gif`, SECRET),
      /malformed/i);
    assert.throws(() => verifyUnsubscribeToken(`${token}.a.b`, SECRET),
      /malformed/i);
  });

  it('produces urlsafe tokens (no +, /, =)', () => {
    const token = signUnsubscribeToken({ sendId: 1 }, SECRET);
    assert.ok(!/[+/=]/.test(token), 'token contains URL-unsafe characters');
  });
});

describe('open tracking tokens', () => {
  it('round-trips a send id', () => {
    const token = signOpenToken(42, SECRET);
    assert.strictEqual(verifyOpenToken(token, SECRET).sendId, 42);
  });

  it('produces urlsafe tokens (no +, /, =)', () => {
    assert.ok(!/[+/=]/.test(signOpenToken(1, SECRET)));
  });

  it('rejects a token signed with a different secret', () => {
    const token = signOpenToken(42, SECRET);
    assert.throws(() => verifyOpenToken(token, 'different-secret'),
      /invalid signature/i);
  });

  // A pixel URL travels in plain sight inside every email and shows up in
  // proxy logs. If it were interchangeable with an unsubscribe token, anyone
  // who scraped one could suppress that lead.
  it('cannot be replayed as an unsubscribe token', () => {
    const openToken = signOpenToken(42, SECRET);
    assert.throws(() => verifyUnsubscribeToken(openToken, SECRET),
      /wrong token type/i);
  });

  it('does not accept an unsubscribe token as an open token', () => {
    const unsubToken = signUnsubscribeToken({ sendId: 42 }, SECRET);
    assert.throws(() => verifyOpenToken(unsubToken, SECRET),
      /wrong token type/i);
  });
});
