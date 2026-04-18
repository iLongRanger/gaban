import { signUnsubscribeToken } from './unsubscribeTokenService.js';

const REQUIRED_CONFIG = ['legalName', 'operatingName', 'mailingAddress', 'publicAppUrl', 'tokenSecret'];

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

  return {
    subject,
    body: `${body}\n${footer}`,
  };
}
