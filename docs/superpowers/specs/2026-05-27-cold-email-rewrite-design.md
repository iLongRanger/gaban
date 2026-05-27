# Cold Email Rewrite — Walkthrough-First Conversion Design

**Status:** Approved (design phase) — pending implementation plan.
**Replaces:** TOUCH 1 / TOUCH 2 / TOUCH 3 prompt language in `src/services/draftingService.js` (touch routing scaffold from `2026-05-21-marketing-hardening` plan is retained).

---

## Problem

The current TOUCH 1 prompt offers a "one-page checklist" as a give-first lead magnet and asks the prospect to reply "yes" to receive it. Three failures:

1. **No fulfillment asset exists.** We would be promising a PDF we have not built, per vertical.
2. **No conversion mechanic.** Owners of restaurants, clinics, warehouses, and offices do not read cleaning checklists and then go shopping for a new vendor. The lead-magnet funnel is a SaaS/consultant pattern, not a local-trades pattern.
3. **Still asks for a micro-commitment with zero payoff for the prospect.** "Reply yes" is friction without value.

The 5-vertical model (`restaurant | brewery | industrial | retail | office`) also misclassifies ~30% of live leads. Medical/dental/physio/wellness leads and government/institutional leads are currently dumped into `office`, so they receive openers about "monitor dust" and "kitchenette grime" that read as tone-deaf for those buyers.

## Goal

Rewrite the three-touch cold email sequence around a **walkthrough-first conversion mechanic** with an **invoice-match rescue** on touch 2, and expand the vertical model from 5 to 7 buckets so every facility category gets an opener that sounds like a peer who understands their operation.

## Non-goals

- Subject-line A/B framework. (Subject conventions baked into the prompt; explicit A/B is out of scope.)
- DM rewrite. Focus is email reply rate; DM variants continue to be produced by the same prompt but are not the optimization target.
- Lead-magnet asset production (checklists, PDFs). The concept is removed, not deferred.
- Calendar integration. The prompt asks the prospect to propose times; scheduling stays manual.

---

## Design

### Conversion mechanic

| Touch | Offer | Why it works |
|---|---|---|
| 1 | Free 15-minute on-site walkthrough + written quote on the spot | Removes vendor-trust risk by putting a human on-site at the moment of buying intent. Costs the crew ~20–30 minutes of windshield + walking time per prospect. |
| 2 | Invoice match — "forward last month's invoice, we'll show you what we'd do for the same number, or the same scope for less, within 24 hours, no sales call" | Rescues the silent "already have a cleaner" segment by reframing the ask as a zero-effort price check. Strongest de-risker, deliberately held back from touch 1 because it requires more trust than a stranger has earned in one email. |
| 3 | Breakup — "I'll close the file, no follow-up. If your current setup ever slips, my number's in the signature." | Pressure-off close consistently outperforms every other touch on reply rate in cold outreach data. |

**Why this order:** Walkthrough is the primary mechanic. Invoice-match is the de-risker deployed *after* the primary ask has failed, not as the lead offer. Putting the strongest de-risker in touch 1 is the most common mistake in cold outreach for local trades — it asks too much, too early.

### Vertical model (7 buckets, up from 5)

| Vertical | Catches (regex hooks) | Specialty line angle |
|---|---|---|
| `restaurant` | restaurant, cafe, coffee, diner, bistro, pizza, sushi, bakery, grill, kitchen, eatery, brunch, breakfast, sandwich, chicken, hamburger, fast food, fine dining, food | grease, hood vents, late-night deep clean between dinner and breakfast |
| `brewery` | brewery, taproom, bar, pub, distiller, winery, cocktail, casino | floor drains, glycol spills, sticky tap mats, drain-line work |
| `industrial` | warehouse, plant, equipment, machinery, industrial, manufactur, yard, workshop, factory, fabricat, chemical, metal, auto, garage, storage, shipping, mover, telecom service | high-ledge dust, oil drips, dock-area sweep, wide-floor work |
| `retail` | store, shop, boutique, clothing, grocery, market, salon, spa, gym, fitness, barber, nail, yoga, shopping mall | glass storefronts, fingerprints, change-room mirrors, entrance-mat grit |
| `office` | corporate office, business center, coworking, office space rental, insurance, employment, immigration, legal, courthouse-adjacent professional services | desk/monitor dust, kitchenette grime, washroom restock midweek |
| **`medical`** *(new)* | medical, dental, physio, clinic, lab, skin care, massage, wellness, chiropractic, mental health, women's health, x-ray, optometr, naturopath | treatment-room turnover, patient-perceived sanitation, lobby cleanliness as a retention lever |
| **`civic`** *(new)* | government, city hall, courthouse, driver's license, federal office, public health, non-profit, condominium complex | high-traffic public lobbies, public-washroom restock cadence, insured/background-checked staff |

**Classifier ordering rule:** Specific verticals match before general ones. Order: `medical → civic → brewery → restaurant → industrial → retail → office (fallback)`. Required because, e.g., "medical equipment supplier" must land in `medical`, not `industrial`.

**Edge-case assignments (defensible defaults; revisit if reply data suggests otherwise):**
- `gym`, `yoga studio`, `spa` → `retail` (consumer storefront experience trumps wellness framing).
- `massage therapist`, `skin care clinic` → `medical` (treatment-room sanitation language fits better than retail).
- `cocktail bar`, `casino` → `brewery` (bar-adjacent floor and drink-area pain).
- `condominium complex` → `civic` (strata common-area cleaning is closer to institutional than to retail; flag for review if any of these actually reply).
- `shipping service`, `mover`, `telecom service provider` → `industrial` (yard/dock/equipment-handling operational language).

### Touch 1 prompt skeleton

The LLM must produce a body matching this structure:

1. **Operational observation (1–2 sentences).** Pattern-recognition hook drawn from the vertical's pain points. Never flattery. Never "I hope this finds you well" or "quick question." If review snippets contain a cleanliness signal, use one snippet; otherwise use the vertical's `pain_observation` line directly.
2. **Identity (1 sentence) + specialty (1 sentence).** "I run a small commercial cleaning crew in Metro Vancouver." followed by the vertical's `specialty_line`.
3. **Offer.** "Happy to swing by for a free 15-minute walkthrough and leave you a written quote on the spot. No pressure, no follow-up sales calls."
4. **Effortless ask.** "Reply with a couple of times that work and I'll fit one in." (Never propose specific times — crew handles scheduling on reply.)

Body ≤ 90 words. Subject lowercase, ≤ 5 words, walkthrough-themed.

### Touch 2 prompt skeleton

1. **Acknowledge silence in one beat.** "No worries if my last note got buried."
2. **Reframe.** "If you already have someone cleaning your [vertical noun], the easiest way to test us is a price check — forward last month's invoice and within 24 hours I'll send back what we'd do for the same number, or the same scope for less. No call, no pitch, just numbers on paper."
3. **Sign off.** No new offer beyond the invoice match.

Body ≤ 70 words. Subject lowercase, ≤ 5 words, price-check themed.

### Touch 3 prompt skeleton

1. Acknowledge silence.
2. Close the file and commit to no further outreach.
3. Leave one door open: "If your current setup ever slips, my number's in the signature."

Body ≤ 50 words, three sentences max. Subject already in current prompt (`should I close the file?`) — keep.

### Global writing rules (carried forward from current prompt)

- Identify honestly as the sender (a real Metro Vancouver commercial cleaning operator). Never pretend to be a neighbour or walker-by.
- Never invent a company name. Refer to the sender as "I" or "we." Identity comes from the signature, appended downstream.
- Plain prose. No em dashes, double hyphens, tildes, markdown, bullets, emojis, decorative separators.
- Contractions are fine. Normal punctuation only.
- One specific observation per email. No overpraise.
- Vertical noun ("clinic / shop / taproom / facility / office / store / kitchen") swapped per vertical in touch 2's "if you already have someone cleaning your X" line.

### Data shape

Prompt continues to emit:

```json
{
  "touch_1": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_2": {"email_subject": "...", "email_body": "...", "dm": "..."},
  "touch_3": {"email_subject": "...", "email_body": "...", "dm": "..."}
}
```

No schema change. `email_sends.template_style` continues to hold `touch_1 | touch_2 | touch_3`. `MetricsService.outreachFunnel` already groups by template_style and surfaces per-touch reply / bounce rates without modification.

---

## File changes

**Modify:**
- `src/services/verticalClassifier.js` — expand `VERTICALS` set from 5 to 7 (add `medical`, `civic`). Add ordered regex rules for new buckets ahead of generic ones. Update `RULES` so specific verticals match first.
- `src/services/draftingService.js` — replace `VERTICAL_PAIN` with `VERTICAL_COPY` map keyed by vertical, each entry containing `{ pain_observation, specialty_line, noun }`. Delete `VERTICAL_GIFT` entirely. Rewrite `buildDraftingPrompt` body to encode the three touch skeletons above. Touch 1 instructs the LLM to draw from `pain_observation` and `specialty_line`; touch 2 instructs it to use `noun`.

**Modify (tests):**
- `tests/verticalClassifier.test.js` — add cases for medical (dentist, physio, clinic, massage, skin care lab) and civic (city hall, courthouse, government office, public health, condominium complex). Update the canonical `VERTICALS` set assertion.
- `tests/draftingService.test.js` — update prompt assertions: prompt must mention the resolved vertical, must include "free 15-minute walkthrough" in touch 1, must include "forward last month's invoice" in touch 2, must include "close the file" in touch 3. Drop the old gift / checklist assertions. Add a per-vertical pain-language spot check (e.g., medical prompt mentions "treatment-room"; civic prompt mentions "public-facing"; brewery prompt mentions "drain" or "glycol").

**Create:** none.

**Delete:** none.

### Out-of-scope cleanup deferred

- One-off redraft script (`scripts/redraft-active-campaigns.js` or similar, per commit `6af13a0`) will need to be re-run against active campaigns after the prompt change ships, but is not modified by this design.
- The historical plan doc `docs/superpowers/plans/2026-05-21-marketing-hardening.md` still references `VERTICAL_GIFT` and "WorkSafeBC walkthroughs" — left as a historical artifact, not edited.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Walkthrough offer creates real driving load on the crew if reply rate spikes. | Acceptable: the goal IS to drive more walkthroughs. Capacity ceiling is monitored via existing `WarmupCapService` (daily send cap, not reply cap). If walkthrough requests outpace crew availability, tighten the daily send cap rather than weaken the offer. |
| LLM produces specific time windows despite instructions. | Prompt explicitly forbids proposed times. Reinforce by asserting in `tests/draftingService.test.js` that the prompt contains the words "do not propose specific" or equivalent. |
| `medical` vs `industrial` collision (e.g., "medical equipment supplier"). | Classifier rule order: `medical` matches before `industrial`. Test case added explicitly. |
| Invoice-match in touch 2 still feels too intimate for some prospects (e.g., civic, where invoices may be public-record but procurement-sensitive). | Acceptable for v1. If civic reply rate underperforms by >50% vs other verticals after 4 weeks, design a civic-specific touch 2 (e.g., "happy to bid on your next RFP" instead of invoice match) — out of scope here. |
| Legacy `email_sends` rows with `template_style` of `compliment_question / curious_neighbor / value_lead / touch_1 / touch_2 / touch_3` all coexist in `MetricsService` output. | Acceptable. Legacy rows display as separate rows in the funnel panel; they will age out as new sends accumulate. |

---

## Success metrics (post-deploy, 4-week window)

- Touch 1 reply rate (sent → `replied` event) lifts above the current sequence baseline.
- Touch 2 invoice-match reply rate is non-zero (proves the rescue segment exists).
- Bounce rate stays ≤ 2% (validator already gates; not affected by this change but should not regress).
- Walkthroughs booked per week (manual count, not in DB yet) trend upward.

Visible in the existing `/responses` funnel panel and `/api/heartbeat` payload — no new dashboards required.
