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
  industrial: 'a one-page checklist of the dust-control and safety-walk items that fail WorkSafeBC walkthroughs',
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
- Never invent a company name; refer to the sender only as "I" or "we" and let the email signature provide identity.
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
Acknowledge no reply. Say you will close the file and stop reaching out. Leave one door open ("If your current setup ever slips, my number is in the signature"). No new offer. Three sentences max. This style consistently produces the highest reply rate in cold outreach because it removes pressure.

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
    drafts[key].email_body    = sanitizeMessageText(drafts[key].email_body);
    drafts[key].dm            = sanitizeMessageText(drafts[key].dm);
  }
  return drafts;
}

export function sanitizeMessageText(value) {
  const cleaned = String(value || '')
    .replace(/[~*_`#>]+/g, '')
    .replace(/[—–]+/g, '. ')
    .replace(/\s+-{2,}\s+/g, '. ')
    .replace(/-{2,}/g, '. ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([,.;:?!])([A-Za-z])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+$/g, '')
    .trim();
  return capitalizeSentenceStarts(cleaned);
}

function capitalizeSentenceStarts(value) {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase());
}
