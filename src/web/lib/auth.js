import './loadEnv.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('APP_SECRET env var is required');
  return secret;
}

export function verifyPin(pin) {
  const expected = process.env.APP_PIN;
  if (!expected) throw new Error('APP_PIN env var is required');
  return pin === expected;
}

export function createSessionCookie() {
  const payload = 'gaban-session';
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionCookie(cookie) {
  if (!cookie || !cookie.includes('.')) return false;
  const [payload, sig] = cookie.split('.');
  const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
