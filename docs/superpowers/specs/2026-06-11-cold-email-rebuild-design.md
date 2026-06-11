# Cold Email Rebuild — Design Spec

**Date:** 2026-06-11
**Status:** Awaiting user review

## Problem

The last sending run (406 emails to 169 Metro Vancouver businesses, May 1 – Jun 10) produced
4 real replies, all brush-offs, and zero walkthroughs or jobs. Diagnosis from the live data plus
the `marketing-skills:cold-email` reference set:

- **Wrong hook type.** Every email opens with generic vertical pain ("kitchens get greasy").
  Trigger/observation hooks tied to the *specific* business outperform problem hooks 3.4x on
  meetings booked. We already pull the data to do this (`reviews_data`, rating, review count) but
  don't use it as the spine.
- **Presumptuous core ask.** The current Touch 2 asks a stranger to forward last month's cleaning
  invoice. Too much, too soon — it reads as "who are you to ask that."
- **Too short a sequence.** 3 touches. The data shows 4–5 touches get ~27% reply vs ~9% for 1–3.
- **Deliverability risk.** 8% bounce on a single Gmail mailbox. `recipientValidator` exists but 32
  bounces got through, so the gate is not catching what it should. Best copy will not help mail
  that lands in spam or hits dead addresses.

## Goal

Rebuild the outreach sequence to lift the reply rate (and convert replies to walkthroughs) by:

1. Leading each first touch with a **trigger hook** drawn from the specific lead's review data.
2. Replacing the invoice ask with a **poke-the-bear question** opener and a **social-proof +
   no-obligation walkthrough** follow-up.
3. Extending to a **4-touch sequence** with rotating angles and a 1-2-3 breakup.
4. **A/B testing the Touch 1 opener** (poke-the-bear vs routing question) and measuring per-arm
   reply rate through the existing funnel.
5. **Tightening deliverability** so the 4th touch does not degrade sender reputation.

## Non-goals (this spec)

- New acquisition channels (Google Business Profile, referrals, ads). Noted as higher-leverage for
  a local cleaner, but out of scope here — we are improving the channel already built.
- Multi-mailbox rotation / domain warmup infrastructure beyond fixing the existing validator and
  suppression behavior.
- DM rewrite beyond keeping DM variants in sync with the new email structure.

## Business facts (honesty constraints)

- Service area: **Metro Vancouver**. Crew of **five**, **insured and registered**.
- Named clients available for generic-location social proof:
  - restaurant near New Westminster Station; a restaurant in Surrey
  - brewery in East Vancouver
  - community center in Downtown Vancouver (civic)
  - clinic in Newport, Port Coquitlam (medical)
  - store in the River District (retail)
  - industrial and office: **no client yet** → credential-only social proof, never a fabricated client.

## The Sequence

All emails under 75 words, 3rd–5th grade reading level, you-dominant, plain prose (existing
sanitizer rules retained). Cadence follows the skill's data: Day 0 / 4 / 10 / 21.

### Touch 1 (Day 0) — trigger hook + opener question. No offer.

Structure: (1) a trigger observation specific to THIS business, drawn from review data when a
concrete detail exists, otherwise the vertical's default operational observation; (2) the opener;
(3) one identity line ("small insured and registered crew of five, working around [lead city]").

**A/B — two opener arms, generated for every lead, assigned 50/50 downstream:**

- **Arm A — poke-the-bear** (recommended): a neutral question that surfaces the invisible
  reliability/quality gap without pitching.
  > *Restaurant:* Subject `overnight clean` — "Looks like you do big weekend covers. When the
  > overnight clean misses something, a greasy hood vent or a sticky floor by the bar, how do you
  > usually catch it: does a morning staffer flag it, or does a customer notice first? That gap is
  > the main thing we get called about. Small insured crew working around New West."
- **Arm B — routing question** (user hypothesis to test):
  > Subject `cleaning` — "Quick one: who looks after the cleaning at [Name] these days? Small
  > insured crew working around [area], picking up a few [vertical]s nearby. If you're the right
  > person I'll share what we'd do; if not, no worries."

### Touch 2 (Day 4) — social proof + no-obligation walkthrough. Replaces the invoice ask.

References the Touch 1 gap once, names a real nearby client generically, offers a 15-minute
walkthrough with no pitch. Industrial/office use credential-only proof.

> *Restaurant:* "Following my note about what gets missed overnight. We just picked up the
> overnight clean for a restaurant near New West Station — they switched because their old crew got
> inconsistent. If it's ever useful, happy to swing by for 15 minutes and point out the spots that
> usually get skipped. No pitch."

### Touch 3 (Day 10) — give-first useful tip. No ask.

One genuinely useful, vertical-specific item (e.g., the health-inspection item restaurants miss,
the WorkSafeBC dust item for shops). Demonstrates expertise. "No reply needed, just thought it'd
save you a headache."

### Touch 4 (Day 21) — breakup, 1-2-3 format.

> "I'll stop here so I'm not cluttering your inbox. If it's worth a look down the road, reply with
> a number: 1 — worth a quick chat, 2 — not now, check back in a few months, 3 — not for us. Either
> way, good luck heading into summer."

If a breakup is sent, it is honored: no further contact.

## Architecture & Changes

### 1. `src/services/draftingService.js`
- Expand `VERTICAL_COPY` (all 7 verticals: restaurant, brewery, industrial, retail, office,
  medical, civic) with new fields: `trigger_hint`, `social_proof` (generic-location client line or
  credential-only fallback), `value_tip`. Keep existing `noun` / `specialty_line` / `pain_observation`.
- Rewrite `buildDraftingPrompt` to:
  - Instruct the model to pick the Touch 1 trigger from review snippets when a concrete detail
    exists, else fall back to the vertical observation.
  - Emit a 5-key JSON: `touch_1_poke`, `touch_1_route`, `touch_2`, `touch_3`, `touch_4`
    (each `{email_subject, email_body, dm}`).
  - Inject the lead's city (from `formatted_address`) into the identity line.
- Update `sanitizeDrafts` / `TOUCH_KEYS` for the new keys.

### 2. Campaign scheduling (`src/services/campaignService.js` — read first)
- Schedule **4 touches** at Day 0 / 4 / 10 / 21 (verify current cadence and touch count first).
- **A/B assignment:** at schedule time, assign each lead 50/50 (deterministic by lead id) to the
  poke or route arm; persist `template_style = 'touch_1_poke' | 'touch_1_route'` for Touch 1 and
  `'touch_2' | 'touch_3' | 'touch_4'` for the rest.

### 3. `src/services/metricsService.js`
- `outreachFunnel` already groups by `template_style`, so both Touch 1 arms surface automatically.
- Add `abComparison({ since })` returning per-arm sent / replied / reply_rate for the two Touch 1
  arms, to back a simple winner readout on `/responses` and via the `ab-testing` skill's method.

### 4. Deliverability (`src/services/recipientValidator.js`, `sendQueueWorker.js`, suppression)
- Investigate the 32 bounces: which addresses, and whether they predate validator deployment.
- Tighten the gate: reject role/no-reply local-parts that bounce often if data supports it; ensure
  bounced addresses are **auto-added to the suppression list** so we never re-hit them.
- Confirm the validator actually runs in the live send path (not just in tests).

### 5. UI (`src/web/app/(app)/responses/page.tsx`)
- Add a small Touch-1 A/B readout (poke vs route: sent, replies, reply rate) above the existing
  funnel panel, reading `abComparison`.

## Testing

- `draftingService.test.js`: assert 5-key output, trigger-from-review behavior, per-vertical social
  proof present, no invoice ask, city injected, breakup 1-2-3 present.
- `metricsService.test.js`: add `abComparison` coverage.
- Campaign/worker tests: 4-touch scheduling + A/B arm assignment + `template_style` persistence.
- Deliverability: bounced address → suppression; validator runs in send path.
- Full `npm test` green.

## Open items for user review

- Confirm or tweak the Arm B (routing question) phrasing.
- Confirm Day 0/4/10/21 cadence is acceptable given send-volume constraints.
- Confirm credential-only social proof wording for industrial/office.
