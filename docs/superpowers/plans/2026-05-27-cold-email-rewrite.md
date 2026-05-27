# Cold Email Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the give-first checklist prompt with a walkthrough-first + invoice-match + breakup sequence, and expand the vertical classifier from 5 to 7 buckets so medical and civic leads get an opener built for their buyer.

**Architecture:** Two coordinated edits to existing modules — no new files. `verticalClassifier.js` grows two ordered rules (`medical`, `civic`) and reshuffles existing rules so specific verticals match before general ones. `draftingService.js` replaces the `VERTICAL_PAIN` + `VERTICAL_GIFT` maps with a single `VERTICAL_COPY` map (containing `pain_observation`, `specialty_line`, and `noun` per vertical) and rewrites `buildDraftingPrompt` to encode the new three-touch shape. Active and pre-drafted `email_sends` rows are not touched; the prompt change applies only to drafts produced after deploy (drafting happens at campaign-creation time in `campaignService.js`, so naturally only new campaigns pick it up).

**Tech Stack:** Node 22 ESM, `node:test`, `better-sqlite3`, OpenAI via `openAiJsonClient`. No schema change.

**Spec:** `docs/superpowers/specs/2026-05-27-cold-email-rewrite-design.md`.

---

## File Structure

**Modify:**
- `src/services/verticalClassifier.js` — expand `VERTICALS` set to 7 entries; add `medical` and `civic` regex rules; reorder so specific rules match before general ones.
- `src/services/draftingService.js` — replace `VERTICAL_PAIN` and `VERTICAL_GIFT` with `VERTICAL_COPY`; rewrite the body of `buildDraftingPrompt` per the spec.
- `tests/verticalClassifier.test.js` — add cases for medical and civic; update the canonical `VERTICALS` set assertion; add edge-case ordering tests.
- `tests/draftingService.test.js` — update the vertical-pain assertion to match new copy; add walkthrough / invoice / breakup / no-proposed-times assertions; add per-vertical spot checks for medical and civic.

**Create:** none.
**Delete:** none.

---

## Task 1: Expand Vertical Classifier to 7 Buckets

**Files:**
- Modify: `src/services/verticalClassifier.js`
- Test: `tests/verticalClassifier.test.js`

- [ ] **Step 1: Rewrite the failing test file**

Replace the contents of `tests/verticalClassifier.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVertical, VERTICALS } from '../src/services/verticalClassifier.js';

test('classifies food service into restaurant', () => {
  assert.equal(classifyVertical({ type: 'Restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Cafe' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Pizza restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Coffee shop' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Brunch restaurant' }), 'restaurant');
});

test('classifies breweries, bars, and casinos into brewery', () => {
  assert.equal(classifyVertical({ type: 'Brewery' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Taproom' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Bar' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Pub' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Cocktail bar' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Casino' }), 'brewery');
});

test('classifies industrial yards, shipping, and movers into industrial', () => {
  assert.equal(classifyVertical({ type: 'Equipment supplier' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Warehouse' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Chemical plant' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Manufacturer' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Shipping service' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Mover' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Telecommunications service provider' }), 'industrial');
});

test('classifies storefront retail and fitness into retail', () => {
  assert.equal(classifyVertical({ type: 'Boutique' }), 'retail');
  assert.equal(classifyVertical({ type: 'Clothing store' }), 'retail');
  assert.equal(classifyVertical({ type: 'Shopping mall' }), 'retail');
  assert.equal(classifyVertical({ type: 'Gym' }), 'retail');
  assert.equal(classifyVertical({ type: 'Yoga studio' }), 'retail');
});

test('classifies medical, dental, and wellness into medical', () => {
  assert.equal(classifyVertical({ type: 'Medical clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Dentist' }), 'medical');
  assert.equal(classifyVertical({ type: 'Dental clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Physiotherapy Center' }), 'medical');
  assert.equal(classifyVertical({ type: 'Medical laboratory' }), 'medical');
  assert.equal(classifyVertical({ type: 'Skin care clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Massage therapist' }), 'medical');
  assert.equal(classifyVertical({ type: 'Mental health clinic' }), 'medical');
  assert.equal(classifyVertical({ type: "Women's health clinic" }), 'medical');
  assert.equal(classifyVertical({ type: 'X-ray lab' }), 'medical');
  assert.equal(classifyVertical({ type: 'Chiropractor' }), 'medical');
});

test('medical wins over industrial for "medical equipment supplier"', () => {
  assert.equal(classifyVertical({ type: 'Medical equipment supplier' }), 'medical');
});

test('classifies government, civic, and condos into civic', () => {
  assert.equal(classifyVertical({ type: 'Government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'Federal government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'City Hall' }), 'civic');
  assert.equal(classifyVertical({ type: 'City government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'Courthouse' }), 'civic');
  assert.equal(classifyVertical({ type: "Driver's license office" }), 'civic');
  assert.equal(classifyVertical({ type: 'Public health department' }), 'civic');
  assert.equal(classifyVertical({ type: 'Non-profit organization' }), 'civic');
  assert.equal(classifyVertical({ type: 'Condominium complex' }), 'civic');
});

test('falls back to office for generic professional services', () => {
  assert.equal(classifyVertical({ type: 'Insurance broker' }), 'office');
  assert.equal(classifyVertical({ type: 'Employment agency' }), 'office');
  assert.equal(classifyVertical({ type: 'Immigration & naturalization service' }), 'office');
  assert.equal(classifyVertical({ type: 'Coworking space' }), 'office');
  assert.equal(classifyVertical({ type: 'Corporate office' }), 'office');
  assert.equal(classifyVertical({ type: 'Business center' }), 'office');
  assert.equal(classifyVertical({ type: 'Office space rental agency' }), 'office');
  assert.equal(classifyVertical({ type: undefined }), 'office');
  assert.equal(classifyVertical({}), 'office');
});

test('exports the canonical 7-vertical set', () => {
  assert.deepEqual(
    [...VERTICALS].sort(),
    ['brewery', 'civic', 'industrial', 'medical', 'office', 'restaurant', 'retail']
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/verticalClassifier.test.js`
Expected: FAIL — at least the `medical`, `civic`, casino, mover, shipping, telecom, condominium, and 7-vertical-set assertions fail because the current classifier only knows 5 buckets and lacks these patterns.

- [ ] **Step 3: Rewrite the classifier**

Replace the entire contents of `src/services/verticalClassifier.js` with:

```javascript
export const VERTICALS = new Set([
  'restaurant',
  'brewery',
  'industrial',
  'retail',
  'office',
  'medical',
  'civic',
]);

// Order matters: specific verticals must be tested before general ones.
// medical wins over industrial so "Medical equipment supplier" -> medical.
// civic wins over office so "Government office" -> civic.
// brewery wins over retail so "Cocktail bar" -> brewery (no retail overlap, but order is intentional).
const RULES = [
  {
    vertical: 'medical',
    patterns: [/medical|dental|dentist|physio|clinic|laboratory|\blab\b|skin\s*care|massage|wellness|chiropract|mental\s+health|women'?s\s+health|x-?ray|optometr|naturopath/i],
  },
  {
    vertical: 'civic',
    patterns: [/government|city\s*hall|courthouse|driver'?s?\s*license|federal\s+office|public\s+health|non[-\s]?profit|condominium/i],
  },
  {
    vertical: 'brewery',
    patterns: [/brewer|taproom|\bbar\b|pub|distiller|winery|cocktail|casino/i],
  },
  {
    vertical: 'restaurant',
    patterns: [/restaurant|cafe|coffee|diner|bistro|pizz|sushi|bakery|grill|kitchen|eatery|food/i],
  },
  {
    vertical: 'industrial',
    patterns: [/warehouse|plant|equipment|machinery|industrial|manufactur|yard|workshop|factory|fabricat|chemical|metal|auto|garage|storage|shipping|\bmover\b|telecom/i],
  },
  {
    vertical: 'retail',
    patterns: [/store|shop|boutique|clothing|grocery|market|salon|spa|gym|fitness|barber|nail|yoga|shopping\s*mall/i],
  },
];

export function classifyVertical(lead) {
  const type = String(lead?.type || '').trim();
  if (!type) return 'office';
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(type))) return rule.vertical;
  }
  return 'office';
}
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/verticalClassifier.test.js`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/verticalClassifier.js tests/verticalClassifier.test.js
git commit -m "feat: expand vertical classifier to 7 buckets with medical and civic"
```

---

## Task 2: Rewrite Drafting Prompt for Walkthrough-First Sequence

**Files:**
- Modify: `src/services/draftingService.js`
- Test: `tests/draftingService.test.js`

**Why:** The current TOUCH 1 promises a checklist that does not exist and lacks a conversion mechanic. New TOUCH 1 offers a free 15-minute walkthrough + on-the-spot written quote. New TOUCH 2 rescues the silent "already have a cleaner" segment with an invoice match. TOUCH 3 keeps the pressure-off breakup. Vertical pain language and a vertical noun for touch 2 are pulled from a new `VERTICAL_COPY` map keyed by all 7 verticals.

- [ ] **Step 1: Update the test file**

Replace the existing `tests/draftingService.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText, stripTrailingSignature, sanitizeDrafts } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1: { email_subject: '15 min walkthrough this week', email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2: { email_subject: 'price check on your cleaner',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3: { email_subject: 'should I close the file',      email_body: 'Hi, ...', dm: 'Hey ...' },
});

function createMockClient(responseText) {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: responseText }] }),
    },
  };
}

const SAMPLE_LEAD = {
  business_name: "Joe's Bistro",
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  rating: 4.2,
  reviews_count: 85,
  reviews_data: [{ review_text: 'Great food, cozy space', review_rating: 5 }],
  reasoning: 'Strong cleanliness signals',
};

test('draftOutreach returns three touch variants with email and DM each', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  for (const key of ['touch_1', 'touch_2', 'touch_3']) {
    assert.ok(drafts[key], `${key} missing`);
    assert.ok(drafts[key].email_subject, `${key}.email_subject missing`);
    assert.ok(drafts[key].email_body,    `${key}.email_body missing`);
    assert.ok(drafts[key].dm,            `${key}.dm missing`);
  }
});

test('buildDraftingPrompt encodes the new three-touch shape', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1.*walkthrough/is);
  assert.match(prompt, /TOUCH 2.*invoice/is);
  assert.match(prompt, /TOUCH 3.*breakup/is);
  assert.match(prompt, /free 15-minute walkthrough/i);
  assert.match(prompt, /forward last month'?s invoice/i);
  assert.match(prompt, /close the file/i);
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
  assert.doesNotMatch(prompt, /one-page checklist/i);
  assert.doesNotMatch(prompt, /reply with "yes"/i);
});

test('buildDraftingPrompt forbids proposed times in touch 1', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Do NOT propose specific dates, days, or time windows/i);
});

test('buildDraftingPrompt swaps vertical pain hooks per vertical', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurantPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const breweryPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  const medicalPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Dental clinic' });
  const civicPrompt      = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'City Hall' });
  const industrialPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Warehouse' });
  const retailPrompt     = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Boutique' });
  const officePrompt     = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Insurance broker' });

  assert.match(restaurantPrompt, /hood|grout|kitchen/i);
  assert.match(breweryPrompt,    /glycol|drain|taproom/i);
  assert.match(medicalPrompt,    /treatment-room|clinic|patient/i);
  assert.match(civicPrompt,      /public-facing|lobby|insured/i);
  assert.match(industrialPrompt, /dust|shop|ledge/i);
  assert.match(retailPrompt,     /storefront|entrance-mat|glass/i);
  assert.match(officePrompt,     /kitchenette|monitor|washroom/i);
});

test('buildDraftingPrompt passes a vertical noun for the touch 2 invoice line', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const medicalPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Dental clinic' });
  const civicPrompt   = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'City Hall' });
  const breweryPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Taproom' });
  assert.match(medicalPrompt, /cleaning your clinic/i);
  assert.match(civicPrompt,   /cleaning your facility/i);
  assert.match(breweryPrompt, /cleaning your taproom/i);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = { messages: { create: async () => { throw new Error('api down'); } } };
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  assert.match(drafts.error, /Drafting failed/);
});

test('buildDraftingPrompt forbids sign-offs, names, phones, and websites in body', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Do not name the sender/i);
  assert.match(prompt, /Do NOT end the email with a sign-off/i);
  assert.match(prompt, /No "Thanks"/);
  assert.doesNotMatch(prompt, /my number is in the signature/i);
});

test('sanitizeMessageText still strips em dashes and markdown', () => {
  const result = sanitizeMessageText('Hello — world *bold* and __under__');
  assert.doesNotMatch(result, /[—–*_]/);
});

test('sanitizeMessageText collapses repeated periods left by other replacements', () => {
  assert.equal(sanitizeMessageText('signature.. Owner'), 'Signature. Owner');
  assert.equal(sanitizeMessageText('time . . Thanks'), 'Time. Thanks');
});

test('stripTrailingSignature removes Thanks + name + phone block', () => {
  const input = [
    'Hope your patio holds up through the wet stretch.',
    '',
    'Thanks,',
    'Ralp Ortiz',
    'Owner, Gleam Pro Cleaning',
    '778 681 0922',
    'gleampro.ca',
  ].join('\n');
  const out = stripTrailingSignature(input);
  assert.equal(out, 'Hope your patio holds up through the wet stretch.');
});

test('stripTrailingSignature strips a bare phone number tail', () => {
  const input = 'Drop a note if useful.\n778-681-0922';
  assert.equal(stripTrailingSignature(input), 'Drop a note if useful.');
});

test('stripTrailingSignature keeps body that ends with a real sentence', () => {
  const input = 'No need to reply if not useful.';
  assert.equal(stripTrailingSignature(input), 'No need to reply if not useful.');
});

test('sanitizeDrafts applies signature stripping to bodies', () => {
  const drafts = {
    touch_1: {
      email_subject: '15 min walkthrough this week',
      email_body: 'Reply with a couple of times that work.\n\nThanks,\nAlex Morgan\n604 555 0101',
      dm: 'Quick note for you.',
    },
  };
  const cleaned = sanitizeDrafts(drafts);
  assert.doesNotMatch(cleaned.touch_1.email_body, /Alex Morgan/);
  assert.doesNotMatch(cleaned.touch_1.email_body, /604 555 0101/);
  assert.doesNotMatch(cleaned.touch_1.email_body, /Thanks,/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/draftingService.test.js`
Expected: FAIL — the new walkthrough / invoice / breakup, vertical-noun, no-proposed-times, and per-vertical pain spot checks all fail against the current prompt.

- [ ] **Step 3: Rewrite the drafting prompt and copy map**

Replace the entire contents of `src/services/draftingService.js` with:

```javascript
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
  2. The reframe: if they already have someone cleaning their ${copy.noun}, the easiest test is a price check. Ask them to forward last month's invoice. Promise a response within 24 hours showing what we would do for the same number, or the same scope for less. State explicitly: no call, no pitch, just numbers on paper.
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
```

- [ ] **Step 4: Run drafting tests pass**

Run: `npx node --test tests/draftingService.test.js`
Expected: PASS — all assertions including new walkthrough / invoice / breakup / no-times / per-vertical / vertical-noun checks.

- [ ] **Step 5: Run full suite to catch downstream regressions**

Run: `npm test`
Expected: PASS, all suites. If any test in `tests/integration.test.js`, `tests/outreachFlow.test.js`, `tests/sqlitePipeline.test.js`, `tests/sqliteService.test.js`, or `tests/configMerge.test.js` references `VERTICAL_GIFT`, the old checklist text, or specific touch wording, update that test's expectation to match the new prompt — do NOT add a back-compat shim.

- [ ] **Step 6: Commit**

```bash
git add src/services/draftingService.js tests/draftingService.test.js
git commit -m "feat: rewrite drafting prompt for walkthrough-first + invoice-match sequence"
```

If Step 5 forced edits to other test files, add them to the same commit:

```bash
git add tests/integration.test.js tests/outreachFlow.test.js tests/sqlitePipeline.test.js tests/sqliteService.test.js tests/configMerge.test.js
git commit --amend --no-edit
```

---

## Task 3: Verify Rollout Constraint and Smoke-Test

**Files:** none (verification only).

**Why:** The spec requires that active and existing campaigns keep their previously-drafted email bodies. Drafting happens at campaign-creation time in `campaignService.js`, so new campaigns automatically pick up the new prompt and existing `email_sends` rows are untouched. This task confirms that property and explicitly forbids running any redraft script.

- [ ] **Step 1: Confirm drafting is bound to campaign creation, not send time**

Run: `grep -n "draftOutreach\|DraftingService" src/services/campaignService.js src/services/sendQueueWorker.js src/services/emailResponseMonitor.js`

Expected: `DraftingService` and/or `draftOutreach` appear ONLY in `campaignService.js` (the campaign-creation path). `sendQueueWorker.js` reads pre-drafted `email_sends.subject` and `body` and does not call the drafter. If any send-time code calls `draftOutreach`, stop and ask — the rollout-constraint property does not hold and the design needs revisiting.

- [ ] **Step 2: Confirm no automatic redraft of existing campaigns**

Run: `ls scripts/ 2>/dev/null | grep -i redraft`

Expected: If a redraft script exists (e.g., `scripts/redraft-active-campaigns.js` per commit `6af13a0`), it must NOT be invoked as part of this change. Add a one-line comment to the top of the script noting it is intentionally not run for the 2026-05-27 prompt rewrite, so future operators do not invoke it expecting it to refresh existing campaigns automatically.

Edit (if the script exists), inserting at the very top after the shebang/import block:

```javascript
// NOTE: Do not run after the 2026-05-27 cold-email prompt rewrite without
// explicit operator approval. The new prompt is intentionally applied to
// new campaigns only; existing email_sends rows retain their original bodies.
```

If no redraft script exists, skip this step.

- [ ] **Step 3: Spot-check the new prompt for a representative lead from each vertical**

Run this Node one-liner to dump a prompt per vertical against your live DB so you can read what the LLM will see (read-only):

```bash
node -e "
const Database = require('better-sqlite3');
const DraftingService = require('./src/services/draftingService.js').default;
const db = new Database('data/gaban.sqlite', { readonly: true });
const types = ['Restaurant','Brewery','Warehouse','Boutique','Insurance broker','Dental clinic','City Hall'];
const svc = new DraftingService({ apiKey: 'unused' });
for (const t of types) {
  const lead = db.prepare('SELECT * FROM leads WHERE type LIKE ? LIMIT 1').get('%' + t + '%') || { business_name: 'Sample', type: t };
  console.log('--- ' + t + ' ---');
  console.log(svc.buildDraftingPrompt(lead).slice(0, 1200));
  console.log();
}
"
```

Expected: each prompt's `Vertical:` line matches the bucket you'd expect (Dental clinic -> medical, City Hall -> civic, etc.) and the `VERTICAL CONTEXT` block contains the matching `pain_observation` and `noun` from `VERTICAL_COPY`.

- [ ] **Step 4: Optional live draft against a single seed lead**

Only run if an `OPENAI_API_KEY` is set in the environment and you want to validate the LLM actually follows the new instructions:

```bash
node -e "
const DraftingService = require('./src/services/draftingService.js').default;
const lead = { business_name: 'Test Brewery', type: 'Brewery', formatted_address: 'Vancouver', rating: 4.3, reviews_count: 80, reviews_data: [], reasoning: 'test' };
new DraftingService({ apiKey: process.env.OPENAI_API_KEY }).draftOutreach(lead).then(d => console.log(JSON.stringify(d, null, 2)));
"
```

Expected: `touch_1.email_body` mentions a 15-minute walkthrough, does NOT mention a checklist or "reply yes", and does NOT propose a specific date or time. `touch_2.email_body` mentions forwarding an invoice and the phrase "no call". `touch_3.email_body` is three short sentences. If the LLM still produces a checklist offer or proposes a time, tighten the relevant section of the prompt and re-test.

- [ ] **Step 5: Push to main**

If `npm test` is green and Steps 1–3 pass:

```bash
git push origin main
```

User preference: push to `main` when tests pass. No PR ceremony for solo prompt iteration.

---

## Self-Review

**Spec coverage:**
- Walkthrough-first TOUCH 1, invoice-match TOUCH 2, breakup TOUCH 3 → Task 2.
- 7-vertical model (medical + civic added) → Task 1.
- Vertical noun for TOUCH 2 → Task 2 (`VERTICAL_COPY[v].noun`, prompt assertion in tests).
- Classifier ordering (medical wins over industrial; civic wins over office) → Task 1 (rule order + explicit "medical equipment supplier" test).
- Edge-case assignments (gym/yoga → retail; massage/skin care → medical; casino → brewery; condo → civic; shipping/mover/telecom → industrial) → Task 1 (regex patterns + tests).
- Rollout: new campaigns only, no redraft → Task 3 (verification + script guard comment).
- No schema change, `MetricsService` carries through unchanged → noted in Architecture; nothing to do.
- Global writing rules carried forward (no em dashes, no sign-offs, no invented identity) → preserved verbatim in the new prompt.

**Placeholder scan:** no "TBD", no "implement later", no vague "handle edge cases" — code blocks contain final code; commands contain final commands; expected outputs are stated.

**Type consistency:** `VERTICAL_COPY` keys exactly match the seven `VERTICALS` set members. `copy.noun`, `copy.pain_observation`, `copy.specialty_line` referenced consistently between the prompt template and the test assertions. `classifyVertical(lead)` signature unchanged.
