# Marketing Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift cold-email reply rate by (a) rewriting drafts to be honest, vertical-specific, and give-first across the 3-touch sequence, (b) cutting bounce rate below 2% with pre-send validation, and (c) closing the feedback loop with per-template reply-rate visibility in the operator console.

**Architecture:** Four self-contained slices on top of the existing `src/services/*` and Next.js console: (1) a small `verticalClassifier` module that maps `lead.type` → one of `restaurant | brewery | industrial | retail | office`; (2) a rewritten `draftingService` prompt that branches on vertical and touch number (touch 1 = value gift, touch 2 = soft ask, touch 3 = breakup); (3) a new `recipientValidator` service that syntactically + MX-checks `recipient_email` before the queue worker hands to Gmail, cancelling sends that fail; (4) a new `metricsService` exposing per-template / per-vertical reply, bounce, and unsubscribe rates, surfaced in `/responses` and the heartbeat. The existing `email_events.type='replied'` is already recorded by `emailResponseMonitor.js` — we only need to read it.

**Tech Stack:** Node 22 ESM, `node:test`, `better-sqlite3`, OpenAI via `openAiJsonClient`, Node `dns/promises` for MX checks, Next.js 16 + React 19 (Halon UI), Tailwind 4.

**Out of scope for this plan:** Mailbox warmup changes (already covered by `WarmupCapService`), subject-line A/B framework, multi-mailbox rotation, signature/identity config (kept manual via env), DM rewrite (focus is email replies first).

---

## File Structure

**Create:**
- `src/services/verticalClassifier.js` — pure function `classifyVertical(lead)` → one of 5 verticals; deterministic, no API call.
- `src/services/recipientValidator.js` — `RecipientValidator` class with `validate(email)` returning `{ valid, reason }`. Uses regex + MX lookup with in-memory TTL cache.
- `src/services/metricsService.js` — `MetricsService` class with `outreachFunnel({ since })` returning per-template / per-vertical counts and rates.
- `src/web/app/api/metrics/outreach/route.ts` — GET endpoint that returns `MetricsService.outreachFunnel` JSON.
- `tests/verticalClassifier.test.js`
- `tests/recipientValidator.test.js`
- `tests/metricsService.test.js`

**Modify:**
- `src/services/draftingService.js` — replace `buildDraftingPrompt` with vertical+touch routing; accept `touch_number` and `vertical`; emit `{ touch_1, touch_2, touch_3 }` instead of 3 named styles.
- `src/services/sendQueueWorker.js` — inject `recipientValidator`; in `processSend` (after suppression check, before cap) run validator, cancel send with `error_message='invalid_recipient: <reason>'` and event `type='cancelled'` carrying `reason`.
- `src/services/heartbeatService.js` — extend payload with `bounce_rate_7d`, `reply_rate_7d`, `invalid_recipient_rate_7d` from `MetricsService`.
- `src/web/app/(app)/responses/page.tsx` — add a "Funnel by template" panel reading from `/api/metrics/outreach`.
- `tests/draftingService.test.js` — update fixtures for new `{touch_1, touch_2, touch_3}` shape.
- `tests/sendQueueWorker.test.js` — add invalid-recipient cancellation test.
- `tests/heartbeatService.test.js` — assert the new fields.

**Schema note:** No migration needed. `email_sends.template_style` remains the per-touch label; we will write `'touch_1' | 'touch_2' | 'touch_3'` instead of the old style names, and `MetricsService` will accept either. We retain the `compliment_question | curious_neighbor | value_lead` historical rows for backward-compat queries (counted under a `legacy` bucket).

---

## Task 1: Vertical Classifier

**Files:**
- Create: `src/services/verticalClassifier.js`
- Test: `tests/verticalClassifier.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/verticalClassifier.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVertical, VERTICALS } from '../src/services/verticalClassifier.js';

test('classifies food service into restaurant', () => {
  assert.equal(classifyVertical({ type: 'Restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Cafe' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Pizza restaurant' }), 'restaurant');
});

test('classifies breweries and bars into brewery', () => {
  assert.equal(classifyVertical({ type: 'Brewery' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Taproom' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Bar' }), 'brewery');
});

test('classifies industrial yards into industrial', () => {
  assert.equal(classifyVertical({ type: 'Equipment supplier' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Warehouse' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Chemical plant' }), 'industrial');
});

test('classifies storefront retail', () => {
  assert.equal(classifyVertical({ type: 'Boutique' }), 'retail');
  assert.equal(classifyVertical({ type: 'Clothing store' }), 'retail');
});

test('falls back to office when unknown', () => {
  assert.equal(classifyVertical({ type: 'Accountant' }), 'office');
  assert.equal(classifyVertical({ type: undefined }), 'office');
  assert.equal(classifyVertical({}), 'office');
});

test('exports the canonical vertical set', () => {
  assert.deepEqual(
    [...VERTICALS].sort(),
    ['brewery', 'industrial', 'office', 'restaurant', 'retail']
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/verticalClassifier.test.js`
Expected: FAIL — `Cannot find module '../src/services/verticalClassifier.js'`.

- [ ] **Step 3: Implement classifier**

```javascript
// src/services/verticalClassifier.js
export const VERTICALS = new Set(['restaurant', 'brewery', 'industrial', 'retail', 'office']);

const RULES = [
  { vertical: 'brewery',    patterns: [/brewer|taproom|\bbar\b|pub|distiller|winery/i] },
  { vertical: 'restaurant', patterns: [/restaurant|cafe|coffee|diner|bistro|pizz|sushi|bakery|grill|kitchen|eatery|food/i] },
  { vertical: 'industrial', patterns: [/warehouse|plant|equipment|machinery|industrial|manufactur|yard|workshop|factory|fabricat|chemical|metal|auto|garage|storage/i] },
  { vertical: 'retail',     patterns: [/store|shop|boutique|clothing|grocery|market|salon|spa|gym|fitness|barber|nail/i] },
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
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/verticalClassifier.js tests/verticalClassifier.test.js
git commit -m "feat: classify leads by vertical for outreach routing"
```

---

## Task 2: Rewrite Drafting Prompt — Vertical & Touch Routing

**Files:**
- Modify: `src/services/draftingService.js` (replace `buildDraftingPrompt`, change call signature)
- Modify: `tests/draftingService.test.js`

**Why:** Current prompt funnels every email — across all 3 styles — into "Who handles your cleaning?" That single question is the kill switch. The new prompt has the LLM identify honestly as a commercial cleaning operator in Metro Vancouver, branch on vertical (restaurant / brewery / industrial / retail / office) for pain hooks, and branch on touch number so touch 1 *gives*, touch 2 *asks*, touch 3 is a *breakup*.

- [ ] **Step 1: Write the failing test**

Replace the contents of `tests/draftingService.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1: { email_subject: 'one thing for your patio', email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2: { email_subject: 'follow up on the checklist',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3: { email_subject: 'should I close the file?',    email_body: 'Hi, ...', dm: 'Hey ...' },
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

test('buildDraftingPrompt includes the resolved vertical and a give-first touch-1 directive', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1/);
  assert.match(prompt, /TOUCH 3.*breakup/is);
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
});

test('buildDraftingPrompt swaps vertical pain hooks per vertical', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurantPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const breweryPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  assert.match(restaurantPrompt, /grease|hood|inspection|stainless/i);
  assert.match(breweryPrompt,    /glycol|drain|floor|kegerator/i);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = { messages: { create: async () => { throw new Error('api down'); } } };
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  assert.match(drafts.error, /Drafting failed/);
});

test('sanitizeMessageText still strips em dashes and markdown', () => {
  const result = sanitizeMessageText('Hello — world *bold* and __under__');
  assert.doesNotMatch(result, /[—–*_]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/draftingService.test.js`
Expected: FAIL — at minimum the vertical-pain and touch-routing tests fail because the existing prompt still emits `curious_neighbor` / `value_lead` / `compliment_question`.

- [ ] **Step 3: Rewrite the drafting prompt**

Replace `buildDraftingPrompt` and the JSON shape it asks for. Full new `src/services/draftingService.js`:

```javascript
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
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/draftingService.test.js`
Expected: PASS — all five tests.

- [ ] **Step 5: Update downstream consumers**

Run: `npx node --test tests/integration.test.js tests/outreachFlow.test.js tests/sqlitePipeline.test.js tests/sqliteService.test.js tests/configMerge.test.js`
Expected: any failures will reference `curious_neighbor` / `value_lead` / `compliment_question`. For each failing assertion, update the expectation to use `touch_1` / `touch_2` / `touch_3` and re-run. Do NOT add a back-compat shim — the new keys are the contract.

- [ ] **Step 6: Verify the campaign writer maps touches to `email_sends.template_style`**

Run: `grep -n "template_style" A:/Projects/gaban/src/services/campaignService.js`
Read the lines that INSERT `email_sends`. Confirm the value written is now one of `touch_1 | touch_2 | touch_3`. If the existing code still writes the legacy style names, change the source so it writes the touch key. If unclear, update the campaign-writer to pull `drafts.touch_${touch_number}` and persist `template_style = 'touch_${touch_number}'`.

- [ ] **Step 7: Full suite**

Run: `npm test`
Expected: PASS, ~145 tests (some will be added in later tasks).

- [ ] **Step 8: Commit**

```bash
git add src/services/draftingService.js tests/draftingService.test.js src/services/campaignService.js tests/integration.test.js tests/outreachFlow.test.js tests/sqlitePipeline.test.js tests/sqliteService.test.js tests/configMerge.test.js
git commit -m "feat: rewrite drafting prompt with vertical routing and 3-touch give-ask-breakup sequence"
```

---

## Task 3: Recipient Email Validator (Syntax + MX)

**Files:**
- Create: `src/services/recipientValidator.js`
- Test: `tests/recipientValidator.test.js`

**Why:** 11/130 sent (≈8.5%) bounced in the existing data. Anything over 2% degrades sender reputation. We add a cheap pre-send gate: syntax + MX record lookup with a TTL cache so we don't repeat lookups on the same domain. We do NOT do SMTP-level verification (too slow, often blocked).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/recipientValidator.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RecipientValidator } from '../src/services/recipientValidator.js';

function fakeResolver({ ok = new Set(), throwFor = new Set() } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    resolveMx: async (domain) => {
      calls += 1;
      if (throwFor.has(domain)) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      if (ok.has(domain)) return [{ exchange: 'mx.example.com', priority: 10 }];
      return [];
    },
  };
}

test('rejects syntactically invalid emails without DNS lookup', async () => {
  const dns = fakeResolver();
  const v = new RecipientValidator({ dns });
  const result = await v.validate('not-an-email');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_syntax');
  assert.equal(dns.calls(), 0);
});

test('rejects domains with no MX record', async () => {
  const dns = fakeResolver({ ok: new Set() });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('hello@nowhere.invalid');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'no_mx_records');
});

test('rejects domains where MX lookup throws ENOTFOUND', async () => {
  const dns = fakeResolver({ throwFor: new Set(['nx.example']) });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('hello@nx.example');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'domain_not_found');
});

test('accepts emails on domains with MX records', async () => {
  const dns = fakeResolver({ ok: new Set(['gleampro.ca']) });
  const v = new RecipientValidator({ dns });
  const result = await v.validate('owner@gleampro.ca');
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test('caches MX lookups by domain', async () => {
  const dns = fakeResolver({ ok: new Set(['cached.example']) });
  const v = new RecipientValidator({ dns });
  await v.validate('a@cached.example');
  await v.validate('b@cached.example');
  await v.validate('c@cached.example');
  assert.equal(dns.calls(), 1);
});

test('cache entries expire after ttlMs', async () => {
  const dns = fakeResolver({ ok: new Set(['t.example']) });
  let now = 1_000_000;
  const v = new RecipientValidator({ dns, ttlMs: 100, now: () => now });
  await v.validate('a@t.example');
  now += 200;
  await v.validate('a@t.example');
  assert.equal(dns.calls(), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/recipientValidator.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the validator**

```javascript
// src/services/recipientValidator.js
import { promises as defaultDns } from 'node:dns';

const SYNTAX = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

export class RecipientValidator {
  constructor({ dns = defaultDns, ttlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.dns = dns;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  async validate(email) {
    const value = String(email || '').trim();
    if (!SYNTAX.test(value)) return { valid: false, reason: 'invalid_syntax' };
    const domain = value.split('@')[1].toLowerCase();

    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > this.now()) {
      return cached.result.valid
        ? { valid: true, reason: null }
        : { valid: false, reason: cached.result.reason };
    }

    let result;
    try {
      const records = await this.dns.resolveMx(domain);
      result = records?.length
        ? { valid: true, reason: null }
        : { valid: false, reason: 'no_mx_records' };
    } catch (err) {
      const code = err?.code || '';
      const reason = code === 'ENOTFOUND' || code === 'ENODATA' ? 'domain_not_found' : 'mx_lookup_failed';
      result = { valid: false, reason };
    }

    this.cache.set(domain, { result, expiresAt: this.now() + this.ttlMs });
    return result;
  }
}

export default RecipientValidator;
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/recipientValidator.test.js`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/recipientValidator.js tests/recipientValidator.test.js
git commit -m "feat: add recipient email validator with syntax check and MX cache"
```

---

## Task 4: Wire Validator into Send Queue Worker

**Files:**
- Modify: `src/services/sendQueueWorker.js`
- Modify: `tests/sendQueueWorker.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/sendQueueWorker.test.js`, locate the existing setup, and append:

```javascript
test('cancels send when recipient fails validation', async () => {
  const { worker, db } = createTestWorker({
    validator: { validate: async () => ({ valid: false, reason: 'no_mx_records' }) },
  });
  const sendId = seedScheduledSend(db, { recipient_email: 'broken@nowhere.invalid' });

  await worker.tick({ now: new Date('2026-05-21T15:00:00Z'), limit: 1 });

  const row = db.prepare('SELECT status, error_message FROM email_sends WHERE id = ?').get(sendId);
  assert.equal(row.status, 'cancelled');
  assert.match(row.error_message, /invalid_recipient: no_mx_records/);

  const evt = db.prepare("SELECT type, raw_payload FROM email_events WHERE send_id = ?").get(sendId);
  assert.equal(evt.type, 'cancelled');
  assert.match(evt.raw_payload, /invalid_recipient/);
});

test('passes through to mailer when validator approves', async () => {
  const { worker, db, mailer } = createTestWorker({
    validator: { validate: async () => ({ valid: true, reason: null }) },
  });
  const sendId = seedScheduledSend(db, { recipient_email: 'real@example.com' });

  await worker.tick({ now: new Date('2026-05-21T15:00:00Z'), limit: 1 });

  assert.equal(mailer.calls.length, 1);
  const row = db.prepare('SELECT status FROM email_sends WHERE id = ?').get(sendId);
  assert.equal(row.status, 'sent');
});
```

If `createTestWorker` / `seedScheduledSend` helpers don't exist in this test file, copy the existing setup style from earlier tests in the same file — do NOT introduce a new fixture framework. Pass `validator` into the worker constructor.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/sendQueueWorker.test.js`
Expected: FAIL — the worker either ignores the validator option or sends anyway.

- [ ] **Step 3: Wire the validator**

In `src/services/sendQueueWorker.js`:

a) Add `RecipientValidator` import at the top:

```javascript
import { RecipientValidator } from './recipientValidator.js';
```

b) Extend the constructor — find the constructor signature and add `validator`:

```javascript
constructor({ db, mailer, env = process.env, capService, suppressionService, validator, logger = console }) {
  if (!db) throw new Error('db required');
  if (!mailer) throw new Error('mailer required');
  this.db = db;
  this.mailer = mailer;
  this.env = env;
  this.capService = capService || new WarmupCapService({ db });
  this.suppressionService = suppressionService || new SuppressionService({ db });
  this.validator = validator || new RecipientValidator();
  this.usage = new UsageService({ db });
  this.logger = logger;
}
```

c) In `processSend`, after the suppression check and before `capService.canSend`, insert the validation gate:

```javascript
const validation = await this.validator.validate(send.recipient_email);
if (!validation.valid) {
  this.cancel(send, `invalid_recipient: ${validation.reason}`, now);
  return { id: send.id, status: 'cancelled', reason: `invalid_recipient: ${validation.reason}` };
}
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/sendQueueWorker.test.js`
Expected: PASS — including both new cases plus pre-existing tests (mock validator returning `{valid:true}` keeps them green).

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/sendQueueWorker.js tests/sendQueueWorker.test.js
git commit -m "feat: gate send queue on recipient MX validation"
```

---

## Task 5: Metrics Service for Outreach Funnel

**Files:**
- Create: `src/services/metricsService.js`
- Test: `tests/metricsService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/metricsService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MetricsService } from '../src/services/metricsService.js';
import { runMigrations } from '../src/web/lib/db.js'; // existing migration helper

function makeDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedSend(db, { id, template_style, status = 'sent', sent_at = '2026-05-15T12:00:00Z', recipient_email = 'x@example.com' }) {
  db.prepare(`INSERT INTO email_sends (id, campaign_lead_id, touch_number, template_style, subject, body, recipient_email, status, sent_at, created_at)
              VALUES (?, 1, 1, ?, 's', 'b', ?, ?, ?, ?)`)
    .run(id, template_style, recipient_email, status, sent_at, sent_at);
}

function seedEvent(db, { send_id, type, detected_at = '2026-05-16T12:00:00Z' }) {
  db.prepare(`INSERT INTO email_events (send_id, type, detected_at, raw_payload) VALUES (?, ?, ?, '{}')`)
    .run(send_id, type, detected_at);
}

test('outreachFunnel returns counts and rates per template_style', () => {
  const db = makeDb();
  // 4 touch_1 sent, 1 replied, 1 bounced
  seedSend(db, { id: 1, template_style: 'touch_1' });
  seedSend(db, { id: 2, template_style: 'touch_1' });
  seedSend(db, { id: 3, template_style: 'touch_1' });
  seedSend(db, { id: 4, template_style: 'touch_1' });
  seedEvent(db, { send_id: 1, type: 'replied' });
  seedEvent(db, { send_id: 2, type: 'bounced' });
  // 2 touch_2 sent, 0 replies
  seedSend(db, { id: 5, template_style: 'touch_2' });
  seedSend(db, { id: 6, template_style: 'touch_2' });

  const metrics = new MetricsService({ db });
  const result = metrics.outreachFunnel({ since: '2026-05-01T00:00:00Z' });

  const t1 = result.by_template.find((r) => r.template_style === 'touch_1');
  assert.equal(t1.sent, 4);
  assert.equal(t1.replied, 1);
  assert.equal(t1.bounced, 1);
  assert.equal(t1.reply_rate.toFixed(2), '0.25');
  assert.equal(t1.bounce_rate.toFixed(2), '0.25');

  assert.equal(result.totals.sent, 6);
  assert.equal(result.totals.replied, 1);
});

test('outreachFunnel honors the since filter', () => {
  const db = makeDb();
  seedSend(db, { id: 1, template_style: 'touch_1', sent_at: '2026-04-01T00:00:00Z' });
  seedSend(db, { id: 2, template_style: 'touch_1', sent_at: '2026-05-15T00:00:00Z' });
  const metrics = new MetricsService({ db });
  const result = metrics.outreachFunnel({ since: '2026-05-01T00:00:00Z' });
  assert.equal(result.totals.sent, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/metricsService.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service**

```javascript
// src/services/metricsService.js
export class MetricsService {
  constructor({ db }) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  outreachFunnel({ since } = {}) {
    const sinceIso = since || '1970-01-01T00:00:00Z';

    const rows = this.db.prepare(`
      SELECT
        es.template_style,
        COUNT(*) AS sent,
        SUM(CASE WHEN ev.type = 'replied'        THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN ev.type = 'bounced'        THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN ev.type = 'auto_replied'   THEN 1 ELSE 0 END) AS auto_replied,
        SUM(CASE WHEN ev.type = 'unsubscribed'   THEN 1 ELSE 0 END) AS unsubscribed
      FROM email_sends es
      LEFT JOIN email_events ev ON ev.send_id = es.id
      WHERE es.status = 'sent' AND es.sent_at >= ?
      GROUP BY es.template_style
    `).all(sinceIso);

    const by_template = rows.map((r) => ({
      template_style: r.template_style,
      sent: r.sent,
      replied: r.replied || 0,
      bounced: r.bounced || 0,
      auto_replied: r.auto_replied || 0,
      unsubscribed: r.unsubscribed || 0,
      reply_rate:  r.sent ? (r.replied  || 0) / r.sent : 0,
      bounce_rate: r.sent ? (r.bounced  || 0) / r.sent : 0,
    }));

    const totals = by_template.reduce(
      (acc, r) => ({
        sent:         acc.sent + r.sent,
        replied:      acc.replied + r.replied,
        bounced:      acc.bounced + r.bounced,
        auto_replied: acc.auto_replied + r.auto_replied,
        unsubscribed: acc.unsubscribed + r.unsubscribed,
      }),
      { sent: 0, replied: 0, bounced: 0, auto_replied: 0, unsubscribed: 0 }
    );
    totals.reply_rate  = totals.sent ? totals.replied / totals.sent : 0;
    totals.bounce_rate = totals.sent ? totals.bounced / totals.sent : 0;

    return { by_template, totals, since: sinceIso };
  }
}

export default MetricsService;
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/metricsService.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/metricsService.js tests/metricsService.test.js
git commit -m "feat: add outreach funnel metrics service"
```

---

## Task 6: API Route + Responses Page Panel

**Files:**
- Create: `src/web/app/api/metrics/outreach/route.ts`
- Modify: `src/web/app/(app)/responses/page.tsx`

- [ ] **Step 1: Add the API route**

```typescript
// src/web/app/api/metrics/outreach/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MetricsService } from '../../../../../services/metricsService.js';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get('since') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const metrics = new MetricsService({ db: getDb() });
  return NextResponse.json(metrics.outreachFunnel({ since }));
}
```

If `getDb` / `@/lib/db` imports don't match the existing convention, copy the import style from a neighbouring route (e.g. `src/web/app/api/heartbeat/route.ts`).

- [ ] **Step 2: Verify the route compiles**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 3: Add the panel to the Responses page**

Read the existing `src/web/app/(app)/responses/page.tsx`. Add at the top of the rendered output a "Funnel by touch" section. Minimal addition (client component if the rest of the page is server, else inline fetch):

```tsx
// near the top of the page component file, alongside existing imports:
async function loadFunnel() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`/api/metrics/outreach?since=${encodeURIComponent(since)}`, { cache: 'no-store' });
  return res.json();
}

// in the page component, before the existing response list:
const funnel = await loadFunnel();

<section className="halon-panel">
  <header className="halon-panel__title">Funnel by touch · last 30 days</header>
  <table className="halon-table">
    <thead><tr><th>Template</th><th>Sent</th><th>Replied</th><th>Reply rate</th><th>Bounced</th><th>Bounce rate</th></tr></thead>
    <tbody>
      {funnel.by_template.map((row: any) => (
        <tr key={row.template_style}>
          <td>{row.template_style}</td>
          <td>{row.sent}</td>
          <td>{row.replied}</td>
          <td>{(row.reply_rate * 100).toFixed(1)}%</td>
          <td>{row.bounced}</td>
          <td>{(row.bounce_rate * 100).toFixed(1)}%</td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
```

Match the existing class names from neighbouring panels in `src/web/app/(app)/**/page.tsx` — do NOT invent new CSS classes; reuse the Halon panel/table classes already in use.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Visit `http://localhost:3010/responses`. Confirm the funnel table renders with the historical rows (will show the legacy `compliment_question` / `curious_neighbor` / `value_lead` styles as separate rows alongside any new `touch_*` rows).

- [ ] **Step 5: Commit**

```bash
git add src/web/app/api/metrics/outreach/route.ts src/web/app/(app)/responses/page.tsx
git commit -m "feat: surface outreach funnel rates on the responses page"
```

---

## Task 7: Heartbeat Enrichment

**Files:**
- Modify: `src/services/heartbeatService.js`
- Modify: `tests/heartbeatService.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/heartbeatService.test.js`, add a case asserting the heartbeat payload includes `bounce_rate_7d`, `reply_rate_7d`, `invalid_recipient_rate_7d`:

```javascript
test('heartbeat payload includes 7d outreach health metrics', async () => {
  const db = makeDb();           // existing helper in this test file
  seedSendsAndEvents(db);        // existing helper, or write inline as in metricsService tests
  const service = new HeartbeatService({ db });
  const payload = service.snapshot({ now: new Date('2026-05-21T12:00:00Z') });
  assert.ok('bounce_rate_7d' in payload);
  assert.ok('reply_rate_7d' in payload);
  assert.ok('invalid_recipient_rate_7d' in payload);
  assert.ok(typeof payload.bounce_rate_7d === 'number');
});
```

If `HeartbeatService` doesn't have a sync `snapshot` method, adapt to its existing API surface — read the file first and mirror the existing test style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/heartbeatService.test.js`
Expected: FAIL — fields not present.

- [ ] **Step 3: Implement**

In `src/services/heartbeatService.js`, import `MetricsService` and call `outreachFunnel({ since: sevenDaysAgo })`. Add to the payload:

```javascript
import { MetricsService } from './metricsService.js';

// inside the method that builds the heartbeat payload:
const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
const funnel = new MetricsService({ db: this.db }).outreachFunnel({ since });
payload.bounce_rate_7d = funnel.totals.bounce_rate;
payload.reply_rate_7d  = funnel.totals.reply_rate;

const invalidCount = this.db.prepare(`
  SELECT COUNT(*) AS c FROM email_events ev
  JOIN email_sends es ON es.id = ev.send_id
  WHERE ev.type = 'cancelled'
    AND ev.raw_payload LIKE '%invalid_recipient%'
    AND ev.detected_at >= ?
`).get(since).c;
const queuedCount = this.db.prepare(`
  SELECT COUNT(*) AS c FROM email_sends WHERE created_at >= ?
`).get(since).c;
payload.invalid_recipient_rate_7d = queuedCount ? invalidCount / queuedCount : 0;
```

Place the additions inside the existing snapshot-building method without breaking the existing payload shape.

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/heartbeatService.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/heartbeatService.js tests/heartbeatService.test.js
git commit -m "feat: include outreach reply, bounce, and invalid-recipient rates in heartbeat"
```

---

## Task 8: Smoke-Test the Pipeline End to End

**Files:** none (verification only).

- [ ] **Step 1: Generate fresh drafts against the dev DB**

Run: `npm start -- --config '{"discoveryLimit": 3, "scoringLimit": 3, "exportOnly": false}'`
(Adjust flag names to match `src/cli/run.js`; if exact flag names differ, run the CLI with `--help` first and use whatever runs the pipeline against 3 leads.)

Confirm in the SQLite store: `SELECT template_style, subject, substr(body, 1, 120) FROM email_sends ORDER BY id DESC LIMIT 9` shows `touch_1` / `touch_2` / `touch_3` with subject lines that are lowercase, ≤5 words, and bodies that identify the sender as a cleaner and do NOT contain the phrase "who handles your cleaning".

- [ ] **Step 2: Visually confirm the funnel panel**

Open `http://localhost:3010/responses`. Confirm the new funnel panel renders. Confirm `template_style` rows include the new `touch_*` keys.

- [ ] **Step 3: Confirm heartbeat**

Run: `curl -s http://localhost:3010/api/heartbeat | python -m json.tool` (or open in browser). Confirm `bounce_rate_7d`, `reply_rate_7d`, `invalid_recipient_rate_7d` are present.

- [ ] **Step 4: Push**

If `npm test` is green and the manual checks pass, push to `main` per user preference:

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** The four buckets from the strategy memo map to Tasks 1–2 (vertical & touch routing), Task 3–4 (bounce control), Tasks 5–6 (per-template visibility), Task 7 (heartbeat surfacing). Smoke test in Task 8.
- **Schema:** No migrations. The `email_events.type='replied'` is already wired by `emailResponseMonitor.js`; `template_style` accepts the new touch keys without any DDL change. Legacy rows remain queryable.
- **Out of scope (deferred):** subject-line A/B framework, multi-mailbox rotation, mining review text for pain-specific personalization beyond the vertical hook, DM rewrite — flag any of these if the user asks for "next phase".
