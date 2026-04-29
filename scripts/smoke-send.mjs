import dotenv from 'dotenv';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';
import { createGmailClientFromEnv, GmailService } from '../src/services/gmailService.js';

dotenv.config();

const recipient = process.argv[2];
if (!recipient) {
  console.error('Usage: node scripts/smoke-send.mjs your-email@example.com');
  process.exit(1);
}

const required = [
  'GMAIL_OAUTH_CLIENT_ID',
  'GMAIL_OAUTH_CLIENT_SECRET',
  'GMAIL_OAUTH_REFRESH_TOKEN',
  'GMAIL_SENDER_EMAIL',
  'UNSUBSCRIBE_TOKEN_SECRET',
  'PUBLIC_APP_URL',
  'BUSINESS_LEGAL_NAME',
  'BUSINESS_OPERATING_NAME',
  'BUSINESS_MAILING_ADDRESS',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`${key} is required`);
    process.exit(1);
  }
}

const subject = 'Gaban Gmail smoke test';
const body = [
  'This is a smoke test from the Gaban outreach bot.',
  'It verifies Gmail sending, the CASL footer, and the public unsubscribe URL.',
].join('\n\n');

const composed = buildOutreachEmail({
  sendId: 999999,
  subject,
  body,
  config: {
    legalName: process.env.BUSINESS_LEGAL_NAME,
    operatingName: process.env.BUSINESS_OPERATING_NAME,
    mailingAddress: process.env.BUSINESS_MAILING_ADDRESS,
    publicAppUrl: process.env.PUBLIC_APP_URL,
    tokenSecret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
  },
});

const client = createGmailClientFromEnv();
const mail = new GmailService({
  client,
  sender: {
    email: process.env.GMAIL_SENDER_EMAIL,
    name: process.env.GMAIL_SENDER_NAME,
  },
});

await mail.send({
  to: recipient,
  subject: composed.subject,
  body: composed.body,
});

console.log('Sent via Gmail API.');
console.log(`From: ${process.env.GMAIL_SENDER_NAME || ''} <${process.env.GMAIL_SENDER_EMAIL}>`);
console.log(`To: ${recipient}`);
