import { signUnsubscribeToken, signOpenToken } from './unsubscribeTokenService.js';

const TRACKING_DISCLOSURE =
  'This email contains a small image that tells us whether this email was opened.';

const REQUIRED_CONFIG = ['legalName', 'operatingName', 'mailingAddress', 'publicAppUrl', 'tokenSecret'];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function validateConfig(config) {
  for (const key of REQUIRED_CONFIG) {
    if (!config?.[key]) throw new Error(`config.${key} is required`);
  }
}

export function buildOutreachEmail({ sendId, subject, body, config }) {
  if (sendId === undefined || sendId === null) throw new Error('sendId is required');
  validateConfig(config);

  const baseUrl = config.publicAppUrl.replace(/\/$/, '');
  const token = signUnsubscribeToken({ sendId }, config.tokenSecret);
  const unsubscribeUrl = `${baseUrl}/u/${token}`;

  const tracking = Boolean(config.trackingEnabled);
  const pixelUrl = tracking
    ? `${baseUrl}/api/track/o/${signOpenToken(sendId, config.tokenSecret)}.gif`
    : null;

  const senderLines = [
    config.senderName,
    config.senderRole,
    config.senderPhone,
    config.senderWebsite,
  ].filter(Boolean);

  const signatureLines = senderLines.length ? ['', ...senderLines] : [];

  const footer = [
    ...signatureLines,
    '',
    '—',
    `${config.legalName} (operating as ${config.operatingName})`,
    config.mailingAddress,
    '',
    "You're receiving this because your contact information is publicly published on your business website.",
    ...(tracking ? [TRACKING_DISCLOSURE] : []),
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  const htmlSignature = senderLines.length
    ? `<div style="margin-top:14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#111827;">${senderLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
    : '';

  const htmlFooter = `
${htmlSignature}
<div style="margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;color:#6b7280;font-family:Arial,sans-serif;font-size:11px;line-height:1.45;">
  <div>${escapeHtml(config.legalName)} (operating as ${escapeHtml(config.operatingName)})</div>
  <div>${escapeHtml(config.mailingAddress)}</div>
  <div style="margin-top:8px;">You're receiving this because your contact information is publicly published on your business website.</div>${tracking ? `\n  <div>${escapeHtml(TRACKING_DISCLOSURE)}</div>` : ''}
  <div>Unsubscribe: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(unsubscribeUrl)}</a></div>
</div>`.trim();

  const htmlPixel = pixelUrl
    ? `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;">`
    : '';

  return {
    subject,
    body: `${body}\n${footer}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${textToHtml(body)}</div>${htmlFooter}${htmlPixel}`,
  };
}
