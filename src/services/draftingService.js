import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';
import { classifyVertical } from './verticalClassifier.js';

const TOUCH_KEYS = ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4'];

const VERTICAL_COPY = {
  restaurant: {
    noun: 'kitchen',
    gap_examples: 'a greasy hood vent, a sticky floor by the bar, or a washroom that slipped overnight',
    social_proof: 'a restaurant near New West Station that switched because their old crew got inconsistent',
    value_tip: 'the five things Vancouver Coastal Health inspectors check first in a kitchen',
  },
  brewery: {
    noun: 'taproom',
    gap_examples: 'glycol seeping into a floor drain, a sour smell in the trench grate, or sticky tap mats',
    social_proof: 'a brewery in East Van that switched after their old crew kept skipping the floor-trough work',
    value_tip: "a floor-drain and glycol cleanup routine that won't void your equipment warranty",
  },
  industrial: {
    noun: 'shop',
    gap_examples: 'fine dust on high shelving, oil drift near the bay doors, or yard grit tracking inside',
    social_proof: 'CREDENTIAL_ONLY',
    value_tip: 'the dust-control and walkway items that fail WorkSafeBC walkthroughs',
  },
  retail: {
    noun: 'store',
    gap_examples: 'fingerprinted entrance glass, dust on display fixtures, or wet-season grit at the door',
    social_proof: 'a store in the River District that switched for a more consistent crew',
    value_tip: 'a winter-entrance routine that keeps slip risk down without wrecking your floors',
  },
  office: {
    noun: 'office',
    gap_examples: 'monitor and desk dust, kitchenette grime, or washroom restock falling behind midweek',
    social_proof: 'CREDENTIAL_ONLY',
    value_tip: 'the disinfection items most janitorial scopes quietly dropped after 2022',
  },
  medical: {
    noun: 'clinic',
    gap_examples: 'treatment-room turnover that slips on busy afternoons, or a waiting room that loses its edge before the front desk notices',
    social_proof: 'a clinic in Port Coquitlam that switched because they needed a crew used to treatment-room cadence',
    value_tip: 'a treatment-room and high-touch disinfection checklist patients actually notice',
  },
  civic: {
    noun: 'facility',
    gap_examples: 'a high-traffic lobby, public washrooms that need restock cadence not just a nightly scrub, or entrance glass the public reads as your standards',
    social_proof: 'a community center in downtown Vancouver that switched because they wanted a crew comfortable working around active-hour foot traffic',
    value_tip: 'a public-washroom restock cadence that holds up through peak hours',
  },
};

const CREDENTIAL_PROOF = 'an insured, registered crew of five working across Metro Vancouver';

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
    const proof = copy.social_proof === 'CREDENTIAL_ONLY'
      ? `${CREDENTIAL_PROOF} (no client name available — lean on credentials, never invent a client)`
      : `we just picked up the cleaning for ${copy.social_proof}`;

    const reviewSnippets = (lead.reviews_data || [])
      .slice(0, 5)
      .map((r) => `- "${r.review_text}"`)
      .join('\n');

    return `You are writing a four-email cold outreach sequence on behalf of the owner of a commercial cleaning crew in Metro Vancouver. The sender is a real local operator. Identify honestly. Never pretend to be a neighbour or unrelated party.

GLOBAL RULES:
- Never invent a company name, person name, phone, website, email, or a client you do not have. A real signature is appended by the system; do not write a sign-off, closing salutation, or trailing name/phone/website.
- Refer to the sender only as "I" or "we". Each email under 75 words. Each DM under 40 words. Plain prose, normal punctuation only. No em dashes, double hyphens, tildes, markdown, bullets, or emojis.
- You-dominant: the reader's situation should lead, not who we are. Use contractions. Aim for a 5th-grade reading level. No "quick question", no "I hope this finds you well".
- For the sender's area, use the city in this address: "${lead.formatted_address || 'Metro Vancouver'}". If unclear, say "around Metro Vancouver".
- Subjects: lowercase, 2 to 4 words, internal-looking (e.g. "overnight clean", "shop floor"). No clickbait, no question marks, no "free"/"quote"/"price".

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'service location'}
- Vertical: ${vertical}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

VERTICAL CONTEXT:
- Gap examples for this vertical (use ONE, paraphrased): ${copy.gap_examples}
- Social proof for touch 2: ${proof}
- Useful tip for touch 3 (give-first, no pitch): ${copy.value_tip}
- Noun for this vertical: ${copy.noun}

REVIEW SNIPPETS (touch 1 trigger: if any snippet names a concrete detail about THIS business — wear, smell, layout, busy nights, line length — paraphrase it as the opening observation. Otherwise open from the gap examples. Ignore generic praise like "great food"):
${reviewSnippets || 'No reviews available'}

WRITE THESE FIVE PIECES:

TOUCH 1 ARM A (poke-the-bear question) — open with the trigger observation, then ask ONE neutral question that exposes the invisible reliability gap (for example, whether a missed ${copy.noun} job gets caught by staff or by a customer first). Close with one short identity line. No offer, no pitch.

TOUCH 1 ARM B (routing question) — open with one short observation, then ask plainly who looks after the cleaning there. Offer to share what we'd do if they're the right person, and give an easy out if not. One identity line. No offer beyond that.

TOUCH 2 (social proof + low-friction walkthrough) — reference the touch 1 gap once, mention the social proof above naturally, then offer a no-obligation 15-minute walkthrough to point out what usually gets missed. No pressure. Do not ask for any financial document, budget figure, or current contract.

TOUCH 3 (give-first) — share the useful tip above as a genuinely helpful note. End with "no reply needed". No ask.

TOUCH 4 (breakup, 1-2-3) — acknowledge no reply, say you'll close the file, then offer a one-line reply menu exactly in this spirit: "reply with a number: 1 — worth a quick chat, 2 — not now, check back in a few months, 3 — not for us." Three sentences max plus the menu.

For each of the five pieces, also write a short DM variant under the same rules.

Respond with ONLY this JSON (no markdown):
{
  "touch_1_poke":  {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_1_route": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_2":       {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_3":       {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_4":       {"email_subject": "...", "email_body": "...", "dm": "..."}
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
