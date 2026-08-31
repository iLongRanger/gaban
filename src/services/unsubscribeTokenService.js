import crypto from 'node:crypto';

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

// Tokens are tagged with a purpose so a token minted for one endpoint can
// never be presented to another. An open-tracking pixel URL is public by
// nature — it sits in the email source and in every proxy log along the way —
// so without this tag, scraping one would be enough to unsubscribe that lead.
const PURPOSE_OPEN = 'o';

export function signUnsubscribeToken(payload, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(json);
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function signOpenToken(sendId, secret) {
  return signUnsubscribeToken({ sendId, p: PURPOSE_OPEN }, secret);
}

export function verifyOpenToken(token, secret) {
  const payload = verifySignedToken(token, secret);
  if (payload.p !== PURPOSE_OPEN) throw new Error('wrong token type');
  return payload;
}

export function verifyUnsubscribeToken(token, secret) {
  const payload = verifySignedToken(token, secret);
  // Untagged tokens are unsubscribe tokens: they predate purpose tagging and
  // are still in the wild in already-delivered mail.
  if (payload.p !== undefined) throw new Error('wrong token type');
  return payload;
}

function verifySignedToken(token, secret) {
  if (!secret) throw new Error('unsubscribe token secret is required');
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new Error('malformed token');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('malformed token');
  }
  const [payloadB64, sig] = parts;
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
