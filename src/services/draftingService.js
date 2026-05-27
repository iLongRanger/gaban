import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';
import { classifyVertical } from './verticalClassifier.js';

const TOUCH_KEYS = ['touch_1', 'touch_2', 'touch_3'];

const VERTICAL_PAIN = {
  restaurant: 'grease on hood vents, sticky tile grout, stainless streaking before inspections, late-night deep cleans between dinner and breakfast service',
  brewery:    'glycol spills on floor drains, kegerator line cleaning, sticky tap mats, sour smell in floor sumps, broken glass in floor drains',
  industrial: 'fine dust on shelving and high ledges, oil drip on shop floors, dock-area sweep, yard debris around bay doors, safety-walk readiness',
  retail:     'fingerprints on glass storefronts, dust on display fixtures, change-room mirrors, entrance mat grit during wet months',
  office:     'desk dust on monitors, kitchenette grime, lobby glass smudges, washroom restock and disinfection between shifts',
};

const VERTICAL_GIFT = {
  restaurant: 'a one-page checklist of the five things Vancouver Coastal Health inspectors hit in kitchens this quarter',
  brewery:    'a one-page checklist for floor-drain and glycol-spill cleanup that won\'t void your warranty',
  industrial: 'a one-page checklist of the dust-control and housekeeping items that most often get flagged on shop-floor safety walks',
  retail:     'a one-page winter-entrance protocol that keeps slip risk low without trashing your floors',
  office:     'a one-page checklist of the post-pandemic disinfection items most janitorial contracts still skip',
};

export default class DraftingService {
  constructor({ apiKey, model, logger, client, usageRecorder } = {}) {
    this.model = model || 'gpt-5-mini';
    this.logger = logger;
    this.client = client || new OpenAiJsonClient({ apiKey, usageRecorder });
  }

  async draftAllLeads(leads) {
    const results = [];
    for (const lead of leads) results.push(await this.draftOutreach(lead));
    return results;
  }

  async draftOutreach(lead) {
    const prompt = this.buildDraftingPrompt(lead);
    try {
      const text = await createJsonCompletion(this.client, {
        model: this.model,
        maxTokens: 4096,
        prompt,
        operation: 'outreach_drafting',
      });
      return sanitizeDrafts(JSON.parse(text));
    } catch (error) {
      this.logger?.warn(`Drafting failed for ${lead.business_name}: ${error.message}`);
      return { error: `Drafting failed: ${error.message}` };
    }
  }

  buildDraftingPrompt(lead) {
    const vertical = classifyVertical(lead);
    const pain = VERTICAL_PAIN[vertical];
    const gift = VERTICAL_GIFT[vertical];

    const reviewSnippets = (lead.reviews_data || [])
      .slice(0, 5)
      .map((r) => `- "${r.review_text}"`)
      .join('\n');

    return `You are writing a three-email cold outreach sequence on behalf of the owner of a commercial cleaning crew based in Metro Vancouver. The sender is a real local operator. Identify honestly. Do not pretend to be a neighbour, walker-by, or unrelated party.

GLOBAL RULES:
- Never invent a company name, a personal name, a phone number, a website, or an email address. The system appends a real signature block with the sender's name, role, phone, and website automatically. Do not duplicate or pre-empt any of that content inside the body.
- Refer to the sender only as "I" or "we". Do not name the sender or the business anywhere in the body or subject.
- Do NOT end the email with a sign-off line. No "Thanks", "Thank you", "Best", "Cheers", "Sincerely", "Regards", "Warmly", "Talk soon", "Looking forward", or any other closing salutation. No trailing name. No trailing phone. No trailing website. End the body with an ordinary sentence and let the system-appended signature handle identity.
- Each email under 90 words. Each DM under 40 words.
- Plain prose. No em dashes, double hyphens, tildes, markdown, bullets, emojis, or decorative separators. Normal punctuation only.
- One specific observation per email. No overpraise. No "quick question". No "I hope this finds you well".
- Use contractions naturally.
- Subject lines: lowercase, five words or fewer, specific to this business or its street. No clickbait.

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'service location'}
- Vertical: ${vertical}
- Address: ${lead.formatted_address || 'Metro Vancouver'}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

VERTICAL PAIN POINTS (pick the one that fits best, do not list more than one):
${pain}

REVIEW SNIPPETS (use one only if it points at cleanliness, wear, or operations; otherwise ignore):
${reviewSnippets || 'No reviews available'}

SCORING INSIGHT: ${lead.reasoning || 'No scoring data'}

WRITE THREE TOUCHES, IN ORDER:

TOUCH 1 — give first, no ask.
Open by identifying as a commercial cleaner working with ${vertical}s nearby. Offer ${gift}. Tell them you will email it if they reply with "yes" (or simply attach it conceptually). Do NOT ask discovery questions. Do NOT pitch. Close with a one-line sign-off.

TOUCH 2 — soft ask, references touch 1.
Acknowledge they may not have seen the first note. Reference the gift once. Then make ONE concrete, low-friction offer: a 15-minute walkthrough next week, or a no-cost trial deep-clean of one area. Give a specific suggested time window (e.g. "Tuesday or Thursday after 2pm"). One short paragraph.

TOUCH 3 — breakup.
Acknowledge no reply. Say you will close the file and stop reaching out. Leave one door open by inviting them to reach back out if their current setup ever slips. Do NOT mention "signature", a phone number, contact details, or how to reach you — the appended signature handles that. No new offer. Three sentences max. This style consistently produces the highest reply rate in cold outreach because it removes pressure.

For each touch, also write a short DM variant suitable for Instagram or a contact-form message.

Respond with ONLY this JSON (no markdown):
{
  "touch_1": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_2": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_3": {"email_subject": "...", "email_body": "...", "dm": "..."}
}`;
  }
}

export function sanitizeDrafts(drafts) {
  for (const key of TOUCH_KEYS) {
    if (!drafts?.[key]) continue;
    drafts[key].email_subject = sanitizeMessageText(drafts[key].email_subject);
    drafts[key].email_body    = sanitizeMessageText(stripTrailingSignature(drafts[key].email_body));
    drafts[key].dm            = sanitizeMessageText(stripTrailingSignature(drafts[key].dm));
  }
  return drafts;
}

const SIGNOFF_RE = /^(thanks(?:\s+(?:so much|again|a lot|in advance))?|thank you|thx|ty|best(?:\s+regards)?|cheers|sincerely(?:\s+yours)?|regards|kind\s+regards|warmly|warm\s+regards|talk\s+soon|cordially|yours(?:\s+truly)?|with\s+thanks|all\s+the\s+best|appreciate\s+it|looking\s+forward|respectfully)\b[,.!\s-]*$/i;
const PHONE_RE = /(?:\+?\d[\s().-]?){7,}\d/;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|ca|net|org|io|co|biz)\b(?:\/\S*)?/i;
const ENDS_SENTENCE = /[.!?]\s*['")\]]?$/;

export function stripTrailingSignature(body) {
  const lines = String(body || '').split(/\r?\n/);

  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (last === '') { lines.pop(); continue; }

    if (PHONE_RE.test(last) || URL_RE.test(last) || SIGNOFF_RE.test(last)) {
      lines.pop();
      continue;
    }

    // Strip short trailing lines that don't end like a sentence (likely names / titles)
    if (!ENDS_SENTENCE.test(last) && last.length <= 60 && /^[A-Z]/.test(last)) {
      lines.pop();
      continue;
    }

    break;
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeMessageText(value) {
  const cleaned = String(value || '')
    .replace(/[~*_`#>]+/g, '')
    .replace(/[—–]+/g, '. ')
    .replace(/\s+-{2,}\s+/g, '. ')
    .replace(/-{2,}/g, '. ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([,.;:?!])([A-Za-z])/g, '$1 $2')
    .replace(/\.(?:\s*\.)+/g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+$/g, '')
    .trim();
  return capitalizeSentenceStarts(cleaned);
}

function capitalizeSentenceStarts(value) {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase());
}
