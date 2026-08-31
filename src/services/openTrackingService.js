import { verifyOpenToken } from './unsubscribeTokenService.js';

// Corporate mail gateways fetch every remote resource in a message before the
// recipient ever sees it. Gmail's proxy is deliberately absent: it fetches on
// behalf of a real reader, so its hits are genuine opens.
const SCANNER_AGENTS = [
  /proofpoint/i,
  /barracuda/i,
  /mimecast/i,
  /symantec/i,
  /forcepoint/i,
  /microsoft.?(defender|atp)/i,
  /urldefense/i,
  /bitdefender/i,
];

// Nothing opens a message a heartbeat after it lands; anything this fast is
// the receiving infrastructure walking the message.
const MACHINE_OPEN_WINDOW_MS = 2000;

export function isMachineOpen({ userAgent, sentAt, openedAt }) {
  if (userAgent && SCANNER_AGENTS.some((pattern) => pattern.test(userAgent))) return true;
  if (!sentAt || !openedAt) return false;
  const delta = new Date(openedAt).getTime() - new Date(sentAt).getTime();
  return Number.isFinite(delta) && delta >= 0 && delta < MACHINE_OPEN_WINDOW_MS;
}

/**
 * Record an open against the send named in a signed pixel token.
 *
 * Never throws: the caller has to return an image on every request, including
 * ones carrying a forged, stale, or truncated token.
 */
export function recordOpen({ db, token, secret, userAgent, ip, now = new Date() }) {
  let sendId;
  try {
    // The pixel URL wears a .gif extension so mail clients treat it as an
    // image; the signed token is everything before it.
    const bare = typeof token === 'string' ? token.replace(/\.gif$/i, '') : token;
    ({ sendId } = verifyOpenToken(bare, secret));
  } catch {
    return { recorded: false, reason: 'invalid_token' };
  }

  const send = db.prepare('SELECT id, sent_at FROM email_sends WHERE id = ?').get(sendId);
  if (!send) return { recorded: false, reason: 'unknown_send' };

  const detectedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const payload = {
    user_agent: userAgent || null,
    ip: ip || null,
    machine: isMachineOpen({ userAgent, sentAt: send.sent_at, openedAt: detectedAt }),
  };

  db.prepare(
    `INSERT INTO email_events (send_id, type, detected_at, raw_payload)
     VALUES (?, 'opened', ?, ?)`
  ).run(sendId, detectedAt, JSON.stringify(payload));

  return { recorded: true, sendId, machine: payload.machine };
}

export default { recordOpen, isMachineOpen };
