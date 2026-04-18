import crypto from 'node:crypto';

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signUnsubscribeToken(payload, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(json);
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyUnsubscribeToken(token, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new Error('malformed token');
  }
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    throw new Error('malformed token');
  }
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    throw new Error('invalid signature');
  }
  try {
    return JSON.parse(b64urlDecode(payloadB64));
  } catch {
    throw new Error('malformed token');
  }
}
