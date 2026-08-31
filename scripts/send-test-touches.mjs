import dotenv from 'dotenv';
import DraftingService from '../src/services/draftingService.js';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';
import { createGmailClientFromEnv, GmailService } from '../src/services/gmailService.js';

dotenv.config();

const recipient = process.argv[2] || 'rortiz.dev@gmail.com';

// Simulated clinic lead. The address is the LEAD's (recipient's) — it must
// never appear in the body, which exercises the sender-location sanitizer too.
const lead = {
  id: 102, // even id -> openerArm() picks touch_1_poke (matches production split)
  business_name: 'Columbia Street Clinic',
  type: 'Clinic',
  full_address: '435 Columbia Street, Vancouver, BC',
  rating: 4.4,
  reviews_count: 142,
  reviews_data: [
    { review_text: 'Good care but the waiting room looked tired by late afternoon on a busy day.' },
    { review_text: 'Treatment room felt rushed between patients, surfaces not always wiped down.' },
    { review_text: 'Friendly staff, though the washroom needed restocking when I visited mid-afternoon.' },
  ],
};

// Production picks ONE touch-1 arm per lead by id parity (campaignService.openerArm).
const openerArm = Number(lead.id) % 2 === 0 ? 'touch_1_poke' : 'touch_1_route';

const config = {
  legalName: process.env.BUSINESS_LEGAL_NAME,
  operatingName: process.env.BUSINESS_OPERATING_NAME,
  mailingAddress: process.env.BUSINESS_MAILING_ADDRESS,
  publicAppUrl: process.env.PUBLIC_APP_URL,
  tokenSecret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
  senderName: process.env.BUSINESS_SENDER_NAME,
  senderRole: process.env.BUSINESS_SENDER_ROLE,
  senderPhone: process.env.BUSINESS_SENDER_PHONE,
  senderWebsite: process.env.BUSINESS_SENDER_WEBSITE,
};

const armLabel = openerArm === 'touch_1_poke' ? 'Touch 1 (poke)' : 'Touch 1 (route)';
const PIECES = [
  [openerArm, armLabel],
  ['touch_2', 'Touch 2 (social proof)'],
  ['touch_3', 'Touch 3 (give-first)'],
  ['touch_4', 'Touch 4 (breakup)'],
];

const drafter = new DraftingService({
  apiKey: process.env.OPENAI_API_KEY,
  logger: console,
});

console.log(`Drafting restaurant sequence for "${lead.business_name}"...`);
const drafts = await drafter.draftOutreach(lead);
if (drafts.error) {
  console.error(drafts.error);
  process.exit(1);
}

const client = createGmailClientFromEnv();
const mail = new GmailService({
  client,
  sender: { email: process.env.GMAIL_SENDER_EMAIL, name: process.env.GMAIL_SENDER_NAME },
});

let i = 0;
for (const [key, label] of PIECES) {
  const piece = drafts[key];
  if (!piece) { console.warn(`Missing ${key}`); continue; }
  i += 1;
  const composed = buildOutreachEmail({
    sendId: 900000 + i,
    subject: `[${label}] ${piece.email_subject}`,
    body: piece.email_body,
    config,
  });
  await mail.send({ to: recipient, subject: composed.subject, body: composed.body });
  console.log(`\n=== ${label} ===`);
  console.log(`Subject: ${piece.email_subject}`);
  console.log(piece.email_body);
}

console.log(`\nSent ${i} emails to ${recipient}.`);
