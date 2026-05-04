import '../src/web/lib/loadEnv.js';
import { createGmailClientFromEnv, GmailService } from '../src/services/gmailService.js';

const [, , to, cap, date] = process.argv;

if (!to || !cap || !date) {
  console.error('Usage: node scripts/send-volume-reminder.mjs <to> <daily-cap> <YYYY-MM-DD>');
  process.exit(1);
}

const mailer = new GmailService({
  client: createGmailClientFromEnv(),
  sender: {
    email: process.env.GMAIL_SENDER_EMAIL,
    name: process.env.GMAIL_SENDER_NAME || 'Gaban Bot',
  },
  logger: console,
});

await mailer.send({
  to,
  subject: `Gaban reminder: increase outreach cap to ${cap}/day`,
  body: [
    `Reminder for ${date}: increase the outreach daily cap to ${cap} emails/day if delivery is clean.`,
    '',
    'Before increasing, check:',
    '- Bounce rate is near 0%',
    '- No spam complaints',
    '- No Gmail sending warnings',
    '- Replies and deliverability look normal',
    '',
    'Update it in Settings > Outreach Safety > Global Daily Cap or warm-up settings.',
  ].join('\n'),
});

console.log(`Sent volume reminder for ${date} to ${to}`);
