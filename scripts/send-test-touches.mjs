import dotenv from 'dotenv';
import DraftingService from '../src/services/draftingService.js';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';
import { createGmailClientFromEnv, GmailService } from '../src/services/gmailService.js';

dotenv.config();

// --recycle sends the two-touch re-engagement sequence instead of the five cold pieces.
const RECYCLE = process.argv.includes('--recycle');
const recipient = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'rortiz.dev@gmail.com';

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
  // The send worker reads this from outreach.tracking_enabled. Forced on here so a test
  // send exercises the same pixel path as production rather than a quieter one.
  trackingEnabled: true,
};

const armLabel = openerArm === 'touch_1_poke' ? 'Touch 1 (poke)' : 'Touch 1 (route)';
const COLD_PIECES = [
  [openerArm, armLabel],
  ['touch_2', 'Touch 2 (social proof)'],
  ['touch_3', 'Touch 3 (give-first)'],
  ['touch_4', 'Touch 4 (breakup)'],
];
const RECYCLE_PIECES = [
  ['recycle_1', 'Recycle 1 (own the earlier emails)'],
  ['recycle_2', 'Recycle 2 (close the file)'],
];
const PIECES = RECYCLE ? RECYCLE_PIECES : COLD_PIECES;

const drafter = new DraftingService({
  apiKey: process.env.OPENAI_API_KEY,
  logger: console,
});

console.log(`Drafting ${RECYCLE ? 'recycle' : 'cold'} sequence for "${lead.business_name}"...`);
const drafts = RECYCLE ? await drafter.draftRecycle(lead) : await drafter.draftOutreach(lead);
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
  // html matters: the tracking pixel only rides in the HTML part, so a body-only send
  // would silently skip the thing you are trying to test.
  await mail.send({
    to: recipient,
    subject: composed.subject,
    body: composed.body,
    html: composed.html,
  });
  console.log(`\n=== ${label} ===`);
  console.log(`Subject: ${piece.email_subject}`);
  console.log(piece.email_body);
  console.log(`Pixel in HTML: ${composed.html.includes('/api/track/o/') ? 'yes' : 'NO'}`);
}

console.log(`\nSent ${i} emails to ${recipient}.`);
console.log(
  'Note: these use synthetic send ids with no email_sends row, so opening them will NOT'
  + ' record an email_events row — recordOpen rejects an unknown send. The pixel URL itself'
  + ' is real; this only tests that it ships in the message.'
);
