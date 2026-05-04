import { signUnsubscribeToken } from './unsubscribeTokenService.js';

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

  const token = signUnsubscribeToken({ sendId }, config.tokenSecret);
  const unsubscribeUrl = `${config.publicAppUrl.replace(/\/$/, '')}/u/${token}`;

  const footer = [
    '',
    '—',
    `${config.legalName} (operating as ${config.operatingName})`,
    config.mailingAddress,
    '',
    "You're receiving this because your contact information is publicly published on your business website.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  const htmlFooter = `
<div style="margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;color:#6b7280;font-family:Arial,sans-serif;font-size:11px;line-height:1.45;">
  <div>${escapeHtml(config.legalName)} (operating as ${escapeHtml(config.operatingName)})</div>
  <div>${escapeHtml(config.mailingAddress)}</div>
  <div style="margin-top:8px;">You're receiving this because your contact information is publicly published on your business website.</div>
  <div>Unsubscribe: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(unsubscribeUrl)}</a></div>
</div>`.trim();

  return {
    subject,
    body: `${body}\n${footer}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${textToHtml(body)}</div>${htmlFooter}`,
  };
}
