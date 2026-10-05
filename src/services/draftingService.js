import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';
import { classifyVertical } from './verticalClassifier.js';

const COLD_TOUCH_KEYS = ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4'];
const RECYCLE_TOUCH_KEYS = ['recycle_1', 'recycle_2'];
const TOUCH_KEYS = [...COLD_TOUCH_KEYS, ...RECYCLE_TOUCH_KEYS];

const VERTICAL_COPY = {
  restaurant: {
    noun: 'kitchen',
    gap_examples: 'a greasy hood vent, a sticky floor by the bar, or a washroom that slipped overnight',
    social_proof: 'a restaurant near New West Station that switched because their old crew got inconsistent',
    // Grounded in VCH's own published inspection areas (food-contact surfaces, handwashing,
    // waste/pest control) so the give-first tip is real, not an invented "top five" claim.
    value_tip: 'the cleaning-side items health inspectors actually flag: sanitized food-contact surfaces, a stocked handwash sink, and clean floor drains and waste areas that keep pests down',
  },
  brewery: {
    noun: 'taproom',
    gap_examples: 'glycol seeping into a floor drain, a sour smell in the trench grate, or sticky tap mats',
    social_proof: 'a brewery in East Van that switched after their old crew kept skipping the floor-trough work',
    // WorkSafeBC names standing water and grease on floors as a slip hazard; keep it factual,
    // not the old unsourceable "won't void your warranty" claim.
    value_tip: 'the slip risk WorkSafeBC ties to standing water and glycol on the floor, so clean floor troughs and drains and dry tap mats matter more than they look',
  },
  industrial: {
    noun: 'shop',
    gap_examples: 'fine dust on high shelving, oil drift near the bay doors, or yard grit tracking inside',
    social_proof: 'CREDENTIAL_ONLY',
    // WorkSafeBC lists dust, oil and grease on floors as slip hazards and calls for clear
    // walkways and drip pans/containment. Real attribution, not an invented "fails walkthroughs".
    value_tip: 'what WorkSafeBC ties to slips on a shop floor, dust, oil and grease plus blocked walkways, so drip pans, contained storage and clear paths matter more than a shiny floor',
  },
  retail: {
    noun: 'store',
    gap_examples: 'fingerprinted entrance glass, dust on display fixtures, or wet-season grit at the door',
    social_proof: 'a store in the River District that switched for a more consistent crew',
    // WorkSafeBC names tracked-in water as a slip hazard; a wet-season entrance routine is
    // genuinely useful advice grounded in that, not a floor-damage claim we can't back.
    value_tip: 'the slip risk WorkSafeBC ties to tracked-in water and grit at the door, so a wet-season entrance routine with good mats and prompt drying is worth the effort',
  },
  office: {
    noun: 'office',
    gap_examples: 'monitor and desk dust, kitchenette grime, or washroom restock falling behind midweek',
    social_proof: 'CREDENTIAL_ONLY',
    // Public-health guidance (CDC / BCCDC-affiliated NCCEH) says frequently-touched surfaces
    // get disinfected at least daily. Real, not the old unverifiable "dropped after 2022" claim.
    value_tip: 'the high-touch spots public-health guidance says to disinfect daily, door handles, light switches, shared phones and keyboards, which are the first thing a rushed crew skips',
  },
  medical: {
    noun: 'clinic',
    gap_examples: 'treatment-room turnover that slips on busy afternoons, or a waiting room that loses its edge before the front desk notices',
    social_proof: 'a clinic in Port Coquitlam that switched because they needed a crew used to treatment-room cadence',
    // Same public-health high-touch guidance, framed for a clinic.
    value_tip: 'the high-touch points public-health guidance says to disinfect daily, waiting-room door handles, light switches and chair arms, plus treatment-room surfaces between patients',
  },
  physiotherapy: {
    noun: 'clinic',
    gap_examples: 'treatment tables between patients, shared exercise mats and equipment, or a waiting room that slips on busy afternoons',
    social_proof: 'CREDENTIAL_ONLY',
    // Same public-health high-touch guidance, framed for a physio clinic's shared equipment.
    value_tip: 'the high-touch points public-health guidance says to disinfect daily, treatment tables and shared equipment between patients, plus waiting-room handles and light switches',
  },
  spa: {
    noun: 'spa',
    gap_examples: 'treatment rooms that lose their edge midday, change and shower areas, or foot-spa basins that need more than a rinse',
    social_proof: 'CREDENTIAL_ONLY',
    // Grounded in the BC Guidelines for Personal Service Establishments (foot-spa basins and
    // shared tools cleaned and disinfected between clients). Real authority, no invented claim.
    value_tip: 'what BC personal-service guidelines focus on, foot-spa basins and shared tools cleaned and disinfected between clients, plus treatment surfaces wiped down between appointments',
  },
  civic: {
    noun: 'facility',
    gap_examples: 'a high-traffic lobby, public washrooms that need restock cadence not just a nightly scrub, or entrance glass the public reads as your standards',
    social_proof: 'a community center in downtown Vancouver that switched because they wanted a crew comfortable working around active-hour foot traffic',
    // High-touch washroom points per public-health guidance, plus operational restock advice
    // (the restock cadence is our own practical tip, not attributed to any authority).
    value_tip: 'the washroom high-touch points public-health guidance says to disinfect daily, faucets, stall latches and dispensers, plus a restock cadence that holds through peak hours',
  },
};

const CREDENTIAL_PROOF = 'an insured, registered crew of five working across Metro Vancouver';

// Shared by the cold and recycle prompts so the safety guardrails (no invented clients, no
// sender street address, no proximity or neighbour claims) can never drift apart between them.
const GLOBAL_RULES = `GLOBAL RULES:
- Never invent a company name, person name, phone, website, email, street address, or a client you do not have. A real signature with the sender's name and address is appended by the system; do not write a sign-off, closing salutation, or trailing name/phone/website/address.
- Refer to the sender only as "I" or "we". Each email under 80 words. Each DM under 40 words. Plain prose, normal punctuation only. No em dashes, double hyphens, tildes, markdown, bullets, or emojis.
- You-dominant: the reader's situation should lead, not who we are. Use contractions. Aim for a 5th-grade reading level. No "quick question", no "I hope this finds you well", no "just checking in".
- The sender is a commercial cleaning operator based in Metro Vancouver who serves the wider region. Refer to the reader's location only in general terms (e.g. "around Metro Vancouver" or "your area"). The recipient's mailing address is THEIRS, never yours: never state a street address in the body, and never claim to be nearby, a neighbour, or to walk or drive past their location.
- Subjects: lowercase, 2 to 4 words, plain and topical so they honestly describe what the email is about (e.g. "office cleaning", "your cleaners", "nightly clean", "floor care"). Never disguise the email as internal company mail, a personal note, or a reply. No clickbait, no question marks, no "free"/"quote"/"price".`;

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

  async draftRecycle(lead) {
    const prompt = this.buildRecyclePrompt(lead);
    try {
      const text = await createJsonCompletion(this.client, {
        model: this.model,
        maxTokens: 2048,
        prompt,
        operation: 'outreach_recycle_drafting',
      });
      return sanitizeDrafts(JSON.parse(text));
    } catch (error) {
      this.logger?.warn(`Recycle drafting failed for ${lead.business_name}: ${error.message}`);
      return { error: `Recycle drafting failed: ${error.message}` };
    }
  }

  // Re-engagement copy for a lead who already absorbed a full cold sequence and never
  // replied. The earlier emails are a fact the reader remembers, so the copy owns them;
  // pretending otherwise is both dishonest and the fastest route to a spam complaint.
  buildRecyclePrompt(lead) {
    const vertical = classifyVertical(lead);
    const copy = VERTICAL_COPY[vertical] || VERTICAL_COPY.office;

    return `You are writing a two-touch re-engagement sequence for the owner of a small commercial cleaning crew in Metro Vancouver. The reader was emailed a few times months ago by this same sender and never replied. The sender is a real local operator. Identify honestly.

WHY WE ARE WRITING AGAIN: the earlier emails used a weaker pitch that has since been rewritten. That is the honest reason, and it is the only reason the reader gets a second sequence. Own it plainly in touch 1: we wrote before, we did not hear back, and the earlier note did a poor job explaining what we actually do. Never pretend this is the first time we have written, never imply the reader replied, and never invent a past conversation, call, visit, or quote.

WHAT MAKES THIS CREW DIFFERENT (weave in naturally, never list as features): a small insured crew of five, so the same people clean the space every week and the reader is not chasing a call centre when something is off. That consistency is the hook. The core pain we solve is cleaners who start strong and quietly coast after the first month.

${GLOBAL_RULES}
- This is a second attempt, so earn it with brevity. Touch 1 must read as shorter and plainer than a cold pitch, not longer.
- No guilt, no "I noticed you never got back to me", no "following up again", no implication the reader owes a reply.

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'service location'}
- Vertical: ${vertical}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

VERTICAL CONTEXT:
- Drift examples for this vertical (the reader's cleaners quietly slid to this; use ONE, paraphrased): ${copy.gap_examples}
- Noun for this vertical: ${copy.noun}

WRITE THESE TWO PIECES:

RECYCLE TOUCH 1 (own the earlier emails, then restate the offer cleanly) — open by naming the earlier emails in one short clause and that the pitch in them was weak. Then, in one line, what we actually do: the same insured crew of five every week, so the cleaning does not quietly slide to ONE of the drift examples above (paraphrased, tied to their ${copy.noun}). Close with a no-charge 15-minute walkthrough offer and a one-line reply ask such as "reply with a day that works". No pricing talk, no pressure, no guilt.

RECYCLE TOUCH 2 (close the file, 1-2-3) — say plainly that this is the last email and you will close the file, then offer a one-line reply menu exactly in this spirit: "reply with a number: 1 — worth a quick chat, 2 — not now, check back in a few months, 3 — not for us." Write the menu once and introduce it once: do not say "reply with a number" in a sentence before the menu as well. Three sentences max plus the menu. No new pitch.

For each of the two pieces, also write a short DM variant under the same rules.

Respond with ONLY this JSON (no markdown):
{
  "recycle_1": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "recycle_2": {"email_subject": "...", "email_body": "...", "dm": "..."}
}`;
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

    return `You are writing a five-touch cold outreach sequence for the owner of a small commercial cleaning crew in Metro Vancouver. The sender is a real local operator. Identify honestly. Never pretend to be a neighbour, a customer, or an unrelated party.

WHAT MAKES THIS CREW DIFFERENT (weave in naturally, never list as features): a small insured crew of five, so the same people clean the space every week and the reader is not chasing a call centre when something is off. That consistency is the hook. The core pain we solve is cleaners who start strong and quietly coast after the first month.

${GLOBAL_RULES}

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'service location'}
- Vertical: ${vertical}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

VERTICAL CONTEXT:
- Drift examples for this vertical (the reader's cleaners quietly slid to this; use ONE, paraphrased): ${copy.gap_examples}
- Social proof for touch 2: ${proof}
- Useful tip for touch 3 (give-first, no pitch): ${copy.value_tip}
- Noun for this vertical: ${copy.noun}

REVIEW SNIPPETS (touch 1 trigger: if any snippet names a concrete detail about THIS business — wear, smell, layout, busy nights, line length — paraphrase it as the opening observation. Otherwise open from the gap examples. Ignore generic praise like "great food"):
${reviewSnippets || 'No reviews available'}

WRITE THESE FIVE PIECES:

TOUCH 1 ARM A (poke + soft walkthrough) — open with the real pain as a poke: ask whether their cleaners still do everything they did the first month, or whether it has quietly slid to ONE of the drift examples above (paraphrased, tied to their ${copy.noun}). Land the consistency hook in one line (same insured crew, no call centre). Close by offering a no-charge 15-minute walkthrough to point out what usually gets missed, with a one-line reply ask such as "reply with a day that works". No pricing talk, no hard pitch.

TOUCH 1 ARM B (routing question) — open with one short observation from the drift examples, then ask plainly who looks after the cleaning there. Offer to share what we'd do if they're the right person, and give an easy out if not. One identity line. Keep it shorter than Arm A.

TOUCH 2 (social proof + walkthrough) — reference the touch 1 drift once, mention the social proof above naturally, then re-offer the no-obligation 15-minute walkthrough to point out what usually gets missed. No pressure. Do not ask for any financial document, budget figure, or current contract.

TOUCH 3 (give-first with a human face) — open by making clear there's no pitch, just something useful. Introduce yourself in ONE clause as the owner of a small insured cleaning crew that works across Metro Vancouver (do NOT write a name; the appended signature supplies it). Then state the useful tip above INLINE as a genuinely helpful note tied to their ${copy.noun}. Deliver the actual content in the email itself; never promise a list, checklist, PDF, link, or attachment you are not including, and never claim an authority ranks or counts items unless the tip says so. End with "no reply needed". No ask.

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
    drafts[key].email_body    = sanitizeMessageText(stripSenderLocationClaims(stripTrailingSignature(drafts[key].email_body)));
    drafts[key].dm            = sanitizeMessageText(stripSenderLocationClaims(stripTrailingSignature(drafts[key].dm)));
  }
  return drafts;
}

// Defense-in-depth safety net: even with the corrected prompt, never let a body claim a
// street address as the sender's or claim physical proximity to the recipient (their address
// is not ours). Drops only the offending sentence so the rest of the message survives.
// Deliberately narrow to avoid stripping benign phrases like "Out of curiosity".
// ’ is the curly apostrophe used in stored drafts; match it alongside the straight one.
const SENDER_LOCATION_RE = new RegExp([
  // A sender operation attributed to a street address: "...out of 4260 Hastings", "located at 12 Main".
  String.raw`\b(?:out of|based at|located at|based out of|operate[sd]? out of)\s+\d{1,6}\s+\w`,
  // A sender operation attributed to a base location: "(cleaning) crew out of Burnaby",
  // "business out of New West". The operation noun anchors it so "out of curiosity" is safe.
  String.raw`\b(?:crew|business|operation|company|shop)\s+out of\b`,
  String.raw`\b(?:i|we)\s+(?:run|operate|work)\b[^.?!]*\bout of\b`,
  // Proximity / neighbour self-description ("I'm nearby", "I'm a neighbour", "I'm in the area").
  String.raw`\bi(?:['’]m|\s+am)\s+(?:a\s+)?(?:nearby\b|in the (?:area|neighbou?rhood)|(?:a\s+)?neighbou?r\b)`,
  String.raw`\b(?:i|we)\s+(?:work|live|operate|am|are)\s+(?:just\s+)?(?:nearby|down the street|around the corner|up the street|close by)`,
  // Any first-person "neighbour"/"neighbor" self-reference (impersonation). "neighbourhood" is
  // unaffected by the word boundary.
  String.raw`\bneighbou?r\b`,
  // Proximity by block distance: "a few blocks away", "a couple blocks over", "2 blocks from".
  String.raw`\b(?:a few|a couple(?: of)?|several|two|three|four|five|\d+)\s+blocks?\b`,
  String.raw`\bblocks?\s+(?:away|over|down|up|from)\b`,
  // Habitual proximity to the recipient's location: walk/drive/pass past/by.
  String.raw`\b(?:walk|drive|pass)(?:es|ing|ed|s)?\s+(?:past|by)\b`,
  String.raw`\bdown the street\b`,
  String.raw`\baround the corner\b`,
].join('|'), 'i');

export function stripSenderLocationClaims(body) {
  const text = String(body || '');
  // Split into sentences, keeping each sentence's trailing punctuation via lookbehind.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !SENDER_LOCATION_RE.test(sentence));
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
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
