import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';
import { classifyVertical } from './verticalClassifier.js';

const TOUCH_KEYS = ['touch_1', 'touch_2', 'touch_3'];

const VERTICAL_COPY = {
  restaurant: {
    noun: 'kitchen',
    pain_observation: 'kitchens running this hot tend to put real miles on hood vents and floor grout before anyone notices',
    specialty_line: 'Restaurants are most of what we do, especially the late-night deep work between dinner and breakfast service.',
  },
  brewery: {
    noun: 'taproom',
    pain_observation: 'taprooms your size usually start fighting glycol seeping into the floor drains and a sour smell in the trench grate nobody can quite locate',
    specialty_line: 'A good chunk of our work is breweries and taprooms, including the floor-trough and drain-line work most janitorial contracts skip.',
  },
  industrial: {
    noun: 'shop',
    pain_observation: 'shops your size tend to accumulate fine dust on high ledges and shelving faster than the day crew can keep up, with floor oil and bay-door grit close behind',
    specialty_line: 'We do a lot of shop floors, warehouses, and equipment yards, the high-dust, wide-floor stuff regular office cleaners are not set up for.',
  },
  retail: {
    noun: 'store',
    pain_observation: 'storefronts on streets like yours start losing first impression to entrance-mat grit and fingerprinted glass before staff have even unlocked the till',
    specialty_line: 'We do a lot of retail and storefront work, glass, fixtures, change-room mirrors, and the wet-season entrance routines.',
  },
  office: {
    noun: 'office',
    pain_observation: 'offices your size usually outgrow their cleaning contract about a year before anyone reopens the conversation, with kitchenette grime, monitor dust, and washroom restock falling behind midweek as the early signs',
    specialty_line: 'Most of what we do is offices and mixed-use spaces, including the post-pandemic disinfection items that quietly fell out of most janitorial scopes.',
  },
  medical: {
    noun: 'clinic',
    pain_observation: 'clinics your size usually find the same blind spots between cleaning visits, treatment-room turnover that slips on busy afternoons and a waiting room that quietly loses its first-impression edge before front desk notices',
    specialty_line: 'A meaningful chunk of our work is clinics and wellness practices, treatment rooms, reception, and the washroom cadence that matters for patient retention.',
  },
  civic: {
    noun: 'facility',
    pain_observation: 'public-facing offices like yours carry a different cleaning load than most commercial spaces, high-traffic lobbies, public washrooms that need restock cadence not just nightly scrub, and visible standards the public reads as competence',
    specialty_line: 'We do a fair bit of public-facing and institutional work, staff is insured, background-checked, and used to working around active-hour foot traffic.',
  },
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
    const copy = VERTICAL_COPY[vertical] || VERTICAL_COPY.office;

    const reviewSnippets = (lead.reviews_data || [])
      .slice(0, 5)
      .map((r) => `- "${r.review_text}"`)
      .join('\n');

    return `You are writing a three-email cold outreach sequence on behalf of the owner of a commercial cleaning crew based in Metro Vancouver. The sender is a real local operator. Identify honestly. Do not pretend to be a neighbour, walker-by, or unrelated party.

GLOBAL RULES:
- Never invent a company name, a personal name, a phone number, a website, or an email address. The system appends a real signature block automatically. Do not duplicate or pre-empt any of that content inside the body.
- Refer to the sender only as "I" or "we". Do not name the sender or the business anywhere in the body or subject.
- Do NOT end the email with a sign-off line. No "Thanks", "Thank you", "Best", "Cheers", "Sincerely", "Regards", "Warmly", "Talk soon", "Looking forward", or any other closing salutation. No trailing name. No trailing phone. No trailing website. End the body with an ordinary sentence and let the system-appended signature handle identity.
- Each email under 90 words. Each DM under 40 words.
- Plain prose. No em dashes, double hyphens, tildes, markdown, bullets, emojis, or decorative separators. Normal punctuation only.
- One specific observation per email. No overpraise. No "quick question". No "I hope this finds you well".
- Use contractions naturally.
- Subject lines: lowercase, five words or fewer. No clickbait. No exclamation marks.

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'service location'}
- Vertical: ${vertical}
- Address: ${lead.formatted_address || 'Metro Vancouver'}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

VERTICAL CONTEXT:
- Pain observation (paraphrase, do not quote verbatim): ${copy.pain_observation}
- Specialty line for this vertical (paraphrase as the third sentence of touch 1): ${copy.specialty_line}
- Noun for this vertical (use in touch 2's "if you already have someone cleaning your ___" line): ${copy.noun}

REVIEW SNIPPETS (use one only if it points at cleanliness, wear, or operations; otherwise ignore):
${reviewSnippets || 'No reviews available'}

SCORING INSIGHT: ${lead.reasoning || 'No scoring data'}

WRITE THREE TOUCHES, IN ORDER:

TOUCH 1 — walkthrough offer.
Structure (in order):
  1. Opening 1 to 2 sentences: an operational observation drawn from the vertical pain observation above, or a relevant cleanliness-related review snippet if one is present. Pattern-recognition, not flattery.
  2. One sentence identifying the sender as a small commercial cleaning crew in Metro Vancouver.
  3. One sentence on what we specialize in for this vertical (paraphrase the specialty line above, do not quote verbatim).
  4. The offer: a free 15-minute walkthrough with a written quote on the spot, no pressure, no follow-up sales calls.
  5. The ask: invite the prospect to reply with a couple of times that work and say we will fit one in.
Do NOT propose specific dates, days, or time windows. The crew handles scheduling on reply.
Subject: lowercase, walkthrough-themed, 5 words or fewer.

TOUCH 2 — invoice match.
Structure (in order):
  1. One short line acknowledging the previous note may have been missed.
  2. The reframe: if they already have someone cleaning your ${copy.noun}, the easiest test is a price check. Ask them to forward last month's invoice. Promise a response within 24 hours showing what we would do for the same number, or the same scope for less. State explicitly: no call, no pitch, just numbers on paper.
  3. End with an ordinary sentence. No new offer beyond the invoice match.
Subject: lowercase, price-check-themed, 5 words or fewer.

TOUCH 3 — breakup.
Three sentences maximum.
  1. Acknowledge no reply.
  2. State you will close the file and stop reaching out.
  3. Leave one door open by inviting them to reach back out if their current setup ever slips. Do NOT mention "signature", a phone number, contact details, or how to reach you.
No new offer.

For each touch, also write a short DM variant suitable for Instagram or a contact-form message, following the same constraints.

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
