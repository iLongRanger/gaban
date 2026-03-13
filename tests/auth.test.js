import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Set env vars before importing
process.env.APP_PIN = '1234';
process.env.APP_SECRET = 'test-secret-key-for-testing';

const { verifyPin, createSessionCookie, verifySessionCookie } = await import('../src/web/lib/auth.js');

describe('auth helpers', () => {
  it('verifyPin returns true for correct PIN', () => {
    assert.strictEqual(verifyPin('1234'), true);
  });

  it('verifyPin returns false for wrong PIN', () => {
    assert.strictEqual(verifyPin('0000'), false);
  });

  it('createSessionCookie returns a string', () => {
    const cookie = createSessionCookie();
    assert.strictEqual(typeof cookie, 'string');
    assert.ok(cookie.length > 0);
  });

  it('verifySessionCookie validates a valid cookie', () => {
    const cookie = createSessionCookie();
    assert.strictEqual(verifySessionCookie(cookie), true);
  });

  it('verifySessionCookie rejects a tampered cookie', () => {
    assert.strictEqual(verifySessionCookie('tampered-value'), false);
  });

  it('verifySessionCookie rejects empty string', () => {
    assert.strictEqual(verifySessionCookie(''), false);
  });
});
