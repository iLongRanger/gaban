# Cold Email Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 3-touch cold-email sequence into a trigger-hook, 4-touch give-first sequence with an A/B-tested opener, drop the presumptuous invoice ask, and auto-suppress bounced addresses to protect deliverability.

**Architecture:** Five slices on the existing pipeline. (1) Auto-suppress bounces in `emailResponseMonitor`. (2) Rewrite `draftingService` to emit five drafts per lead — two Touch-1 opener arms (`touch_1_poke`, `touch_1_route`) plus `touch_2`/`touch_3`/`touch_4` — keyed off the existing 7-vertical `VERTICAL_COPY`/`classifyVertical`. (3) Persist the five new draft styles in `sqliteService`. (4) Schedule four touches (Day 0/4/10/21) and assign each lead 50/50 to an opener arm in `campaignService`. (5) Expose per-arm reply rates via `MetricsService.abComparison` and a small panel on `/responses`.

**Tech Stack:** Node 22 ESM, `node:test`, `better-sqlite3`, OpenAI via `openAiJsonClient`, Next.js 16 + React 19.

**Spec:** `docs/superpowers/specs/2026-06-11-cold-email-rebuild-design.md`

---

## File Structure

**Modify:**
- `src/services/emailResponseMonitor.js` — add `SuppressionService`; on a `bounced` event, add the recipient to the suppression list.
- `src/services/draftingService.js` — expand `VERTICAL_COPY` with `gap_examples`/`social_proof`/`value_tip`; rewrite `buildDraftingPrompt`; emit five keys; update `TOUCH_KEYS`/`sanitizeDrafts`.
- `src/services/sqliteService.js` — persist the five new draft styles.
- `src/services/campaignService.js` — 4-touch sequence, `TOUCH_OFFSETS` +touch 4, per-lead opener-arm assignment.
- `src/services/metricsService.js` — add `abComparison({ since })`.
- `src/web/app/(app)/responses/page.tsx` — add a Touch-1 A/B readout.

**Test:**
- `tests/emailResponseMonitor.test.js`, `tests/draftingService.test.js`, `tests/sqliteService.test.js`, `tests/campaignService.test.js`, `tests/metricsService.test.js`.

**Schema note:** No migrations. `outreach_drafts.style`, `email_sends.template_style`, and `suppression_list` already accept arbitrary string values; the new style names and the extra touch slot to need no DDL.

**Rollout note (operational, not a task):** New-style drafts only exist for leads drafted after Task 2 ships. Existing active campaigns must be re-drafted (`scripts/redraft-active.mjs`) before they will schedule under the new styles; a campaign created against a lead with no `touch_1_poke` draft throws `missing ... draft`. Cover this in Task 7's smoke test.

---

## Task 1: Auto-suppress bounced recipients

**Why:** 32 of 406 sends bounced (~8%) and nothing stops us re-hitting the same dead address on the next touch or campaign. The `RecipientValidator` already runs in the send path (`sendQueueWorker.processSend`), but it only proves an MX record exists — it cannot catch a dead mailbox on a live domain. Feeding every bounce into the suppression list is the concrete fix.

**Files:**
- Modify: `src/services/emailResponseMonitor.js`
- Test: `tests/emailResponseMonitor.test.js`

- [ ] **Step 1: Read the monitor constructor and `processMessage`**

Run: open `src/services/emailResponseMonitor.js`. Confirm the constructor destructures `{ db, ... campaigns, logger }` and that `processMessage` records the event inside a `this.db.transaction(() => { ... })` named `apply` (lines ~119-157). You will add a `SuppressionService` and a suppression call in the bounce path.

- [ ] **Step 2: Write the failing test**

Open `tests/emailResponseMonitor.test.js`. Find the existing helper that builds a monitor + seeds a send (mirror its exact setup style — do not introduce a new fixture framework). Add:

```javascript
test('a bounced message suppresses the recipient', async () => {
  const { monitor, db, sendId, recipientEmail } = setupMonitorWithSend({
    // reuse whatever the existing helper accepts; recipient must be a valid address
    recipient_email: 'dead@livedomain.com',
  });

  const bounceMessage = makeBounceMessage({ sendId }); // reuse existing bounce-message builder in this file

  monitor.processMessage(bounceMessage, new Date('2026-06-11T12:00:00Z'));

  const suppression = new SuppressionService({ db });
  assert.equal(suppression.isSuppressed('dead@livedomain.com'), true);
});
```

Add the import at the top of the test file if not present:

```javascript
import { SuppressionService } from '../src/services/suppressionService.js';
```

If the existing helpers have different names, match them — the only new assertions are the two lines about `SuppressionService`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx node --test tests/emailResponseMonitor.test.js`
Expected: FAIL — the recipient is not suppressed (`isSuppressed` returns `false`).

- [ ] **Step 4: Wire suppression into the monitor**

In `src/services/emailResponseMonitor.js`:

a) Add the import near the other service imports at the top:

```javascript
import { SuppressionService } from './suppressionService.js';
```

b) In the constructor, add a suppression service (allow injection, default to a new one). Add this line alongside the existing field assignments:

```javascript
this.suppression = suppression || new SuppressionService({ db });
```

and add `suppression` to the constructor's destructured options object.

c) Inside `processMessage`, within the `apply` transaction, right after the `INSERT INTO email_events ...` statement, add the bounce suppression:

```javascript
if (type === 'bounced') {
  const recipient = this.db.prepare(
    'SELECT recipient_email FROM email_sends WHERE id = ?'
  ).get(send.id)?.recipient_email;
  if (recipient) {
    try {
      this.suppression.add({ email: recipient, reason: 'bounced', source: 'email_response_monitor' });
    } catch {
      // invalid address shape: nothing to suppress, do not abort event recording
    }
  }
}
```

- [ ] **Step 5: Run tests pass**

Run: `npx node --test tests/emailResponseMonitor.test.js`
Expected: PASS — including the new suppression test and all pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/emailResponseMonitor.js tests/emailResponseMonitor.test.js
git commit -m "feat: suppress recipients automatically when their mail bounces"
```

---

## Task 2: Rewrite the drafting prompt (4 touches + opener A/B)

**Files:**
- Modify: `src/services/draftingService.js`
- Test: `tests/draftingService.test.js`

- [ ] **Step 1: Replace the drafting test**

Replace the contents of `tests/draftingService.test.js` with:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1_poke:  { email_subject: 'overnight clean',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_1_route: { email_subject: 'cleaning',         email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2:       { email_subject: 'spots that slip',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3:       { email_subject: 'one quick thing',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_4:       { email_subject: 'closing the file', email_body: 'Hi, ...', dm: 'Hey ...' },
});

function createMockClient(responseText) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text: responseText }] }) } };
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

test('draftOutreach returns five drafts: two opener arms plus touches 2-4', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  for (const key of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
    assert.ok(drafts[key], `${key} missing`);
    assert.ok(drafts[key].email_subject, `${key}.email_subject missing`);
    assert.ok(drafts[key].email_body, `${key}.email_body missing`);
    assert.ok(drafts[key].dm, `${key}.dm missing`);
  }
});

test('prompt describes both opener arms and the 1-2-3 breakup, and drops the invoice ask', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1 ARM A/);
  assert.match(prompt, /TOUCH 1 ARM B/);
  assert.match(prompt, /1 . worth a quick chat/i);     // breakup 1-2-3
  assert.doesNotMatch(prompt, /invoice/i);              // no invoice ask anywhere
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
});

test('prompt swaps social proof and gap examples per vertical', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurant = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const brewery    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  assert.match(restaurant, /New West Station/i);
  assert.match(brewery,    /East Van/i);
  assert.match(restaurant, /hood vent|grout|bar/i);
});

test('industrial uses credential-only social proof (no fabricated client)', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Warehouse' });
  assert.match(prompt, /Vertical:\s*industrial/);
  assert.match(prompt, /insured, registered crew of five/i);
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
Expected: FAIL — current service emits `touch_1/2/3`, has no opener arms, and the prompt still contains the invoice ask.

- [ ] **Step 3: Rewrite `VERTICAL_COPY` and the prompt**

In `src/services/draftingService.js`, replace the `VERTICAL_COPY` constant with the version below (adds `gap_examples`, `social_proof`, `value_tip` to every vertical; keeps `noun`):

```javascript
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
```

Update the touch-key constant at the top of the file:

```javascript
const TOUCH_KEYS = ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4'];
```

Replace `buildDraftingPrompt` with:

```javascript
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

TOUCH 2 (social proof + low-friction walkthrough) — reference the touch 1 gap once, mention the social proof above naturally, then offer a no-obligation 15-minute walkthrough to point out what usually gets missed. No pressure. Never request their invoice, budget, or any document.

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
```

Note: `sanitizeDrafts` already iterates `TOUCH_KEYS`, so updating that constant is enough — no other change to the sanitizer is needed. Confirm `sanitizeDrafts` reads `for (const key of TOUCH_KEYS)` and leave it intact.

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/draftingService.test.js`
Expected: PASS — all seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/draftingService.js tests/draftingService.test.js
git commit -m "feat: rewrite drafting into 4-touch give-first sequence with A/B opener arms"
```

---

## Task 3: Persist the five new draft styles

**Files:**
- Modify: `src/services/sqliteService.js` (the draft-insert loop, ~line 98)
- Test: `tests/sqliteService.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/sqliteService.test.js`. Find the existing test that exports a lead with drafts and inspects `outreach_drafts` (mirror its setup). Add a test that supplies a five-key draft and asserts all five style rows persist:

```javascript
test('persists all five draft styles for a lead', () => {
  const { service, db } = makeService(); // reuse existing helper in this file
  const lead = sampleLead();             // reuse existing helper
  const draft = {
    touch_1_poke:  { email_subject: 'overnight clean', email_body: 'a', dm: 'a' },
    touch_1_route: { email_subject: 'cleaning',        email_body: 'b', dm: 'b' },
    touch_2:       { email_subject: 'spots',           email_body: 'c', dm: 'c' },
    touch_3:       { email_subject: 'tip',             email_body: 'd', dm: 'd' },
    touch_4:       { email_subject: 'closing',         email_body: 'e', dm: 'e' },
  };

  service.exportLeads({ leads: [lead], drafts: [draft], weekLabel: '2026-W24' });

  const styles = db.prepare(
    `SELECT style FROM outreach_drafts od JOIN leads l ON l.id = od.lead_id ORDER BY style`
  ).all().map((r) => r.style);
  assert.deepEqual(styles, ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']);
});
```

Match the real method/helper names in this test file (the export entry point may be `exportLeads`, `saveResults`, etc.). Only the style-set assertion is new.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/sqliteService.test.js`
Expected: FAIL — only `touch_1/2/3` are persisted, so the style set will not match.

- [ ] **Step 3: Update the persistence loop**

In `src/services/sqliteService.js`, change the draft-style loop (currently `for (const style of ['touch_1', 'touch_2', 'touch_3']) {`) to:

```javascript
        for (const style of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
```

The loop body already reads `draft[style]` and skips when missing, so no other change is needed.

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/sqliteService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/sqliteService.js tests/sqliteService.test.js
git commit -m "feat: persist five draft styles per lead"
```

---

## Task 4: Four-touch scheduling with opener A/B assignment

**Files:**
- Modify: `src/services/campaignService.js`
- Test: `tests/campaignService.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/campaignService.test.js`. Find the helper that seeds leads + drafts and creates a campaign (mirror it). The drafts seeded must now include the five new styles. Add:

```javascript
test('schedules four touches and assigns each lead an opener arm', () => {
  const { service, db } = makeCampaignFixture(); // reuse existing helper
  // seed two leads, each with all five draft styles; reuse the fixture's draft seeder
  const leadEven = seedLeadWithDrafts(db, { /* forces an even lead id */ });
  const leadOdd  = seedLeadWithDrafts(db, { /* forces an odd lead id */ });

  const campaign = service.createCampaign({
    presetId: seedPreset(db),
    name: 'rebuild test',
    leadIds: [leadEven, leadOdd],
    startAt: '2026-06-11T16:00:00Z',
  });

  const styles = db.prepare(`
    SELECT cl.lead_id, es.touch_number, es.template_style
    FROM email_sends es JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
    WHERE cl.campaign_id = ? ORDER BY cl.lead_id, es.touch_number
  `).all(campaign.id);

  // four touches per lead
  const perLead = new Map();
  for (const s of styles) perLead.set(s.lead_id, (perLead.get(s.lead_id) || 0) + 1);
  for (const count of perLead.values()) assert.equal(count, 4);

  // touch 1 uses an arm style; even lead -> poke, odd lead -> route
  const t1 = (leadId) => styles.find((s) => s.lead_id === leadId && s.touch_number === 1).template_style;
  assert.equal(t1(leadEven), 'touch_1_poke');
  assert.equal(t1(leadOdd), 'touch_1_route');

  // touches 2-4 use the generic styles
  const t4 = styles.find((s) => s.touch_number === 4).template_style;
  assert.equal(t4, 'touch_4');
});
```

If forcing even/odd lead ids is awkward in the fixture, instead assert that the two leads receive *different* touch-1 styles drawn from `{touch_1_poke, touch_1_route}` and that the assignment is stable when re-read.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/campaignService.test.js`
Expected: FAIL — only three touches are scheduled and touch 1 uses `touch_1`, which has no seeded draft (or the count assertion fails at 3).

- [ ] **Step 3: Update the campaign scheduler**

In `src/services/campaignService.js`:

a) Replace the touch constants near the top:

```javascript
const DEFAULT_TOUCH_STYLES = ['touch_1', 'touch_2', 'touch_3', 'touch_4'];
const TOUCH_OFFSETS = { 1: 0, 2: 4, 3: 10, 4: 21 };

// Deterministic 50/50 opener-arm assignment by lead id.
function openerArm(leadId) {
  return Number(leadId) % 2 === 0 ? 'touch_1_poke' : 'touch_1_route';
}
```

b) In `createCampaign`, compute per-lead touch offsets and arm, and override touch 1's style + draft lookup. Replace the inner `scheduleSequence`/insert block (the `const sequence = scheduleSequence({ startAt: start, existingScheduledTimes: existingTimes, options });` call and the `for (const scheduled of sequence)` loop) with:

```javascript
        const touchOffsets = touchStyles.map((_, i) => TOUCH_OFFSETS[i + 1] ?? 0);
        const sequence = scheduleSequence({
          startAt: start,
          existingScheduledTimes: existingTimes,
          touchOffsets,
          options,
        });

        for (const scheduled of sequence) {
          const style = scheduled.touchNumber === 1
            ? openerArm(leadId)
            : (touchStyles[scheduled.touchNumber - 1] || touchStyles[0]);
          const draft = this.db.prepare(
            `SELECT * FROM outreach_drafts
             WHERE lead_id = ? AND style = ?
             LIMIT 1`
          ).get(leadId, style);
          if (!draft) throw new Error(`missing ${style} draft for lead ${leadId}`);

          this.db.prepare(
            `INSERT INTO email_sends
              (campaign_lead_id, touch_number, template_style, subject, body,
               recipient_email, scheduled_for, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            campaignLeadId,
            scheduled.touchNumber,
            style,
            draft.email_subject,
            draft.edited_email_body || draft.email_body,
            lead.email,
            scheduled.scheduledFor,
            now
          );
          existingTimes.push(scheduled.scheduledFor);
        }
```

The campaign's stored `touch_styles` stays the generic four-element array, so `finalizeIfDone` and the `sendQueueWorker` finalize hook continue to read `maxTouches = 4` correctly.

- [ ] **Step 4: Verify any caller of `createCampaign` does not force a 3-touch list**

Run: `grep -rn "createCampaign\|touchStyles\|touch_styles" src/web`
For each caller, confirm it either omits `touchStyles` (uses the new 4-touch default) or, if it passes an explicit list, update it to the four-element `['touch_1','touch_2','touch_3','touch_4']`. Do not pass arm styles here — arm assignment happens inside `createCampaign`.

- [ ] **Step 5: Run tests pass**

Run: `npx node --test tests/campaignService.test.js`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS. If `sendQueueWorker` or other tests seed 3-touch campaigns with old styles, update their seeded drafts to include `touch_1_poke`/`touch_1_route` and expect four touches, matching the new contract.

- [ ] **Step 7: Commit**

```bash
git add src/services/campaignService.js tests/campaignService.test.js
git commit -m "feat: schedule four touches and split-test the opener arm per lead"
```

---

## Task 5: Per-arm reply-rate comparison in MetricsService

**Files:**
- Modify: `src/services/metricsService.js`
- Test: `tests/metricsService.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/metricsService.test.js`. Reuse the existing `makeDb`/`seedSend`/`seedEvent` helpers. Add:

```javascript
test('abComparison reports reply rate per opener arm', () => {
  const db = makeDb();
  // poke: 4 sent, 2 replied
  for (let i = 1; i <= 4; i += 1) seedSend(db, { id: i, template_style: 'touch_1_poke' });
  seedEvent(db, { send_id: 1, type: 'replied' });
  seedEvent(db, { send_id: 2, type: 'replied' });
  // route: 4 sent, 0 replied
  for (let i = 5; i <= 8; i += 1) seedSend(db, { id: i, template_style: 'touch_1_route' });

  const result = new MetricsService({ db }).abComparison({ since: '2026-05-01T00:00:00Z' });

  assert.equal(result.poke.sent, 4);
  assert.equal(result.poke.replied, 2);
  assert.equal(result.poke.reply_rate.toFixed(2), '0.50');
  assert.equal(result.route.sent, 4);
  assert.equal(result.route.replied, 0);
  assert.equal(result.route.reply_rate.toFixed(2), '0.00');
  assert.equal(result.winner, 'poke');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --test tests/metricsService.test.js`
Expected: FAIL — `abComparison` is not a function.

- [ ] **Step 3: Implement `abComparison`**

In `src/services/metricsService.js`, add this method to the `MetricsService` class (e.g. after `outreachFunnel`):

```javascript
  abComparison({ since } = {}) {
    const sinceIso = since || '1970-01-01T00:00:00Z';
    const arm = (style) => {
      const row = this.db.prepare(`
        SELECT COUNT(DISTINCT es.id) AS sent,
               SUM(CASE WHEN ev.type = 'replied' THEN 1 ELSE 0 END) AS replied
        FROM email_sends es
        LEFT JOIN email_events ev ON ev.send_id = es.id
        WHERE es.status = 'sent' AND es.sent_at >= ? AND es.template_style = ?
      `).get(sinceIso, style);
      const sent = row.sent || 0;
      const replied = row.replied || 0;
      return { sent, replied, reply_rate: sent ? replied / sent : 0 };
    };

    const poke = arm('touch_1_poke');
    const route = arm('touch_1_route');
    let winner = null;
    if (poke.sent && route.sent) {
      if (poke.reply_rate > route.reply_rate) winner = 'poke';
      else if (route.reply_rate > poke.reply_rate) winner = 'route';
      else winner = 'tie';
    }
    return { poke, route, winner, since: sinceIso };
  }
```

- [ ] **Step 4: Run tests pass**

Run: `npx node --test tests/metricsService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/metricsService.js tests/metricsService.test.js
git commit -m "feat: compare opener-arm reply rates for the touch-1 A/B"
```

---

## Task 6: Touch-1 A/B readout on the Responses page

**Files:**
- Modify: `src/web/app/api/metrics/outreach/route.ts`
- Modify: `src/web/app/(app)/responses/page.tsx`

- [ ] **Step 1: Add `ab` to the metrics API response**

Open `src/web/app/api/metrics/outreach/route.ts`. It already builds a `MetricsService` and returns `outreachFunnel`. Extend the JSON to also include the A/B comparison. Change the return so it sends both:

```typescript
  const metrics = new MetricsService({ db: getDb() });
  return NextResponse.json({
    ...metrics.outreachFunnel({ since }),
    ab: metrics.abComparison({ since }),
  });
```

(Keep the existing `since` resolution and imports exactly as they are.)

- [ ] **Step 2: Verify the route compiles**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 3: Add the A/B panel to the Responses page**

Open `src/web/app/(app)/responses/page.tsx`. The page already fetches the funnel (`loadFunnel` / `/api/metrics/outreach`). Above the existing "Funnel by touch" panel, render the A/B readout from `funnel.ab`. Reuse the existing Halon panel/table classes (copy them from the funnel panel — do not invent new class names):

```tsx
<section className="halon-panel">
  <header className="halon-panel__title">Touch 1 opener A/B · last 30 days</header>
  <table className="halon-table">
    <thead><tr><th>Arm</th><th>Sent</th><th>Replied</th><th>Reply rate</th></tr></thead>
    <tbody>
      {(['poke', 'route'] as const).map((arm) => (
        <tr key={arm}>
          <td>{arm === 'poke' ? 'Poke-the-bear' : 'Routing question'}{funnel.ab?.winner === arm ? ' · leading' : ''}</td>
          <td>{funnel.ab?.[arm]?.sent ?? 0}</td>
          <td>{funnel.ab?.[arm]?.replied ?? 0}</td>
          <td>{(((funnel.ab?.[arm]?.reply_rate ?? 0) * 100)).toFixed(1)}%</td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Visit `http://localhost:3010/responses`. Confirm the A/B panel renders above the funnel without errors (both arms show 0 until new sends exist — that's expected).

- [ ] **Step 5: Commit**

```bash
git add src/web/app/api/metrics/outreach/route.ts "src/web/app/(app)/responses/page.tsx"
git commit -m "feat: show touch-1 opener A/B reply rates on the responses page"
```

---

## Task 7: End-to-end smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 2: Generate fresh drafts and inspect them**

Run the pipeline against a few leads (use the project's CLI entry; run it with `--help` first if the exact flags differ):

Run: `npm start -- --config '{"discoveryLimit": 3, "scoringLimit": 3}'`

Then inspect the new drafts:

Run: `node -e "const db=require('better-sqlite3')('data/gaban.sqlite'); console.table(db.prepare(\"SELECT style, substr(email_subject,1,30) subj, substr(email_body,1,90) body FROM outreach_drafts ORDER BY lead_id DESC, style LIMIT 15\").all())"`

Confirm: five styles per lead (`touch_1_poke`, `touch_1_route`, `touch_2`, `touch_3`, `touch_4`); subjects are lowercase and 2-4 words; no body contains the word "invoice"; touch_4 body contains the 1-2-3 menu.

- [ ] **Step 3: Confirm a campaign schedules four touches with split openers**

Re-draft any active campaign leads first so new styles exist, then create a small test campaign through the console (`/campaigns/new`) or the existing CLI/seed path. Confirm in SQLite:

Run: `node -e "const db=require('better-sqlite3')('data/gaban.sqlite'); console.table(db.prepare(\"SELECT cl.lead_id, es.touch_number, es.template_style FROM email_sends es JOIN campaign_leads cl ON cl.id=es.campaign_lead_id ORDER BY es.id DESC LIMIT 12\").all())"`

Confirm four touches per lead and touch 1 split across `touch_1_poke` / `touch_1_route`.

- [ ] **Step 4: Confirm the A/B panel and funnel render**

Open `http://localhost:3010/responses`. Confirm the "Touch 1 opener A/B" panel and the funnel panel both render.

- [ ] **Step 5: Push**

If `npm test` is green and the manual checks pass, push to `main` per user preference:

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** trigger hook + per-vertical copy (Task 2), poke-vs-route A/B opener (Tasks 2/4/5/6), invoice ask removed (Task 2 test asserts no "invoice"), social proof from real named clients with credential-only fallback for industrial/office (Task 2), 4-touch Day 0/4/10/21 cadence (Task 4 via `TOUCH_OFFSETS`), deliverability via bounce auto-suppression (Task 1), per-arm visibility (Tasks 5/6).
- **No migrations:** `outreach_drafts.style`, `email_sends.template_style`, and `suppression_list` already store free-form strings.
- **Type consistency:** the five style names `touch_1_poke | touch_1_route | touch_2 | touch_3 | touch_4` are identical across `draftingService` (`TOUCH_KEYS`), `sqliteService` (persist loop), `campaignService` (`openerArm` + generic styles), and `metricsService` (`abComparison`).
- **Deferred (not in scope):** validator SMTP-level verification, multi-mailbox rotation, domain warmup, and non-email channels (GBP/referrals) remain out of scope per the spec.
```
