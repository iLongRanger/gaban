# Campaign Finished Status + Summary — Design

**Date:** 2026-05-28

## Goal

When an outreach campaign has run its course, automatically transition it to a `finished` status and attach a frozen performance summary. Today campaigns stay `active` forever — there is no completion concept, so finished campaigns are indistinguishable from in-flight ones, dashboards never decay, and there is no record of how a campaign performed.

## Background (current behavior)

- **Campaign status** transitions are only `active` ⇄ `paused` and `active` → `cancelled` (`src/services/campaignService.js`). Nothing sets `finished`/`completed`.
- **Lead status** (`campaign_leads.status`): `queued` → `active` on first send (`sendQueueWorker.js:157`). A lead only reaches a *terminal* state if something happens to it — reply/bounce/auto-reply (`emailResponseMonitor.js`), unsubscribe (`unsubscribeService.js`), or a manual outcome (`outcomeService.js`). A lead that receives all touches and never replies stays `active` indefinitely with `completed_at = NULL`.
- **Touches per campaign** are defined by `campaigns.touch_styles`, a JSON array (currently length 3). Max touches is therefore per-campaign: `JSON.parse(touch_styles).length`.
- **Background worker** (`src/worker/background.js`) runs cron jobs: send-queue tick every minute, response monitor every 5 min, health check every 10 min.
- **Metrics** live in `MetricsService` (`src/services/metricsService.js`), currently a read-only aggregator (`outreachFunnel`).

## Requirements (decided)

1. A campaign gains a `finished` status when its sequence has run out and a grace window has elapsed.
2. A frozen summary (full funnel + outcomes + per-vertical) is captured at finish time.
3. The summary is also recomputable live via an API endpoint, sharing one computation function with the freeze path.
4. After the **final touch** is sent, wait a configurable grace window (default **48 hours**) before finishing, so late replies are captured. Only **silent (no-reply) leads** wait; terminal leads (replied/bounced/unsub/converted) are immediately done.
5. Finish detection is **event-driven + periodic sweep backstop**.
6. If every lead terminates early (final touch never sent, nobody left to email), the campaign still finishes — "wait for the final touch" applies only to silent leads.

## Terminal vs non-terminal lead statuses

- **Non-terminal:** `queued`, `active`.
- **Terminal:** `replied`, `bounced`, `auto_replied`, `unsubscribed`, `interested`, `not_interested`, `out_of_scope`, `meeting_booked`, `contract_signed`.

Define a shared constant `TERMINAL_LEAD_STATUSES` (e.g. in `campaignService.js`) so finish logic and tests stay in sync.

## Architecture

Two collaborating modules, following existing patterns:

- **`campaignService.finalizeIfDone(campaignId, now)`** — owns the status transition (campaignService already owns pause/resume/cancel and `cancelFutureSends`). Evaluates the finish condition; on success freezes the summary and writes `status='finished'`, `finished_at`, `summary`.
- **`MetricsService.campaignSummary(campaignId, { now })`** — pure read/aggregation that returns the summary object. Used by `finalizeIfDone` (to freeze) and by the live API endpoint (to recompute). Single source of truth.

## Schema changes

Additive columns on `campaigns` (add to the `CREATE TABLE` in `src/web/lib/db.js`; existing rows get `NULL`):

- `finished_at TEXT` — ISO timestamp when the campaign was finished.
- `summary TEXT` — frozen JSON summary (see shape below).

No migration framework exists; `initDb` recreates/ensures schema. Confirm during implementation that adding columns does not require a manual `ALTER` for existing DBs; if it does, add an idempotent `ALTER TABLE ... ADD COLUMN` guard.

## Finish condition

`finalizeIfDone(campaignId, now)`:

1. Load the campaign. If `status !== 'active'`, return `{ finished: false, reason: 'not_active' }` (paused/cancelled/finished are never auto-finished).
2. `maxTouches = JSON.parse(campaign.touch_styles).length`.
3. `graceHours = Number(system_settings['outreach.finish_grace_hours']) || 48`.
4. `graceCutoff = now − graceHours`.
5. The campaign is **finished** when ALL hold:
   - **(a)** zero `email_sends` in status `scheduled` or `sending` for the campaign;
   - **(b)** no lead in status `queued`;
   - **(c)** every lead is **terminal**, OR (`status='active'` AND `touch_count >= maxTouches` AND `last_touch_at <= graceCutoff`).
6. If finished: `summary = MetricsService.campaignSummary(campaignId, { now })`; then `UPDATE campaigns SET status='finished', finished_at=now, summary=json` in a transaction. Return `{ finished: true }`.
7. Otherwise return `{ finished: false, reason }`.

Notes:
- The "finish anyway when all terminal" case is covered by condition (c)'s first branch — if every lead is terminal, no touch-3 send is required.
- A lead that is `active` with `touch_count < maxTouches` and no scheduled send is a genuine anomaly (orphaned mid-sequence); it fails (c) and correctly keeps the campaign `active` rather than masking the problem.

## Summary shape

`MetricsService.campaignSummary(campaignId, { now })` returns:

```json
{
  "finished_at": "ISO or null (campaigns.finished_at; null on live recompute of an unfinished campaign)",
  "started_at": "ISO (earliest email_sends.sent_at for the campaign, else campaign created_at)",
  "duration_days": 0,
  "leads": 0,
  "totals": {
    "sent": 0, "replied": 0, "bounced": 0, "unsubscribed": 0,
    "reply_rate": 0.0, "bounce_rate": 0.0
  },
  "by_touch": [
    { "touch": 1, "sent": 0, "replied": 0, "bounced": 0 }
  ],
  "outcomes": {
    "interested": 0, "not_interested": 0,
    "meeting_booked": 0, "contract_signed": 0
  },
  "by_vertical": [
    { "vertical": "restaurant", "sent": 0, "replied": 0, "reply_rate": 0.0 }
  ]
}
```

Computation semantics (mirror `outreachFunnel`'s event-based counting):
- `sent` = count of `email_sends` with `status='sent'` for the campaign.
- `replied`/`bounced`/`unsubscribed` = count of `email_events` of that type joined to the campaign's sends.
- `reply_rate = replied / sent` (0 when `sent === 0`); `bounce_rate = bounced / sent`.
- `by_touch` = the same counts grouped by `email_sends.touch_number`.
- `outcomes` = count of `campaign_leads` grouped by status within the outcome set.
- `by_vertical` = JS aggregation: for each lead, `classifyVertical(lead.type)` (verticalClassifier.js), then roll up sent/replied per vertical. Pure SQL can't do this because `classifyVertical` is JS regex logic.
- `duration_days` = `(finished_at ?? now) − started_at` in whole days.

## Triggers

1. **Worker event hook** — in `sendQueueWorker.processSend`, after the successful lead update (`:161`), if the just-sent touch was the final one (`send.touch_number >= maxTouches`), call `finalizeIfDone(campaignId, now)`. (Usually a no-op because the grace window hasn't elapsed; matters when `graceHours` is small/0.)
2. **Monitor event hook** — in `emailResponseMonitor`, after a lead is marked terminal and future sends cancelled (`:154`), call `finalizeIfDone(campaignId, now)`. Catches the case where the *last* outstanding lead goes terminal after the rest are already past grace.
3. **Sweep backstop** — a new cron in `background.js` (every ~15 min): for each `active` campaign, call `finalizeIfDone(campaignId, now)`. This is the **primary** finalizer for the common silent-lead case once the grace window passes. Interval must be comfortably shorter than the grace window.

The worker/monitor need the `campaignId` for a given `campaign_lead_id` (one lookup join). Pass a shared `CampaignService` (or `db`) instance into both.

## Surfacing

- **Frozen panel:** the campaign detail page (`src/web/app/(app)/campaigns/[id]/page.tsx`) renders a "Results" panel reading `campaigns.summary` (parsed JSON) when `status='finished'`.
- **Live endpoint:** `GET /api/campaigns/[id]/summary` → `MetricsService.campaignSummary(id, { now })` as JSON, for an always-current view.
- **Status recognition:** `finished` is a recognized campaign status in the campaigns list (`page.tsx`) with its own badge; pause/resume actions are hidden for finished campaigns (`CampaignActions.tsx`).

## Testing

- `finalizeIfDone`:
  - not-done (scheduled sends remain) → stays `active`.
  - silent lead at max touches but within grace → stays `active`.
  - silent lead at max touches past grace → `finished`, `finished_at` + `summary` set.
  - all leads terminal early, no touch-3 sent → `finished`.
  - bounced lead does not block finish (terminal immediately).
  - `paused`/`cancelled`/already-`finished` campaign → untouched.
  - respects per-campaign `maxTouches` from `touch_styles`.
  - respects `outreach.finish_grace_hours` override (e.g. set to 0 → finishes immediately).
- `campaignSummary`: totals + rates, `by_touch`, `outcomes`, `by_vertical` (correct vertical bucketing), `duration_days`, behavior when `sent === 0`.
- Integration: worker calls `finalizeIfDone` only after final touch; monitor calls it after a terminal event.

## Out of scope

- Re-activating or "reopening" a finished campaign (no transition out of `finished`).
- Email/notification on finish.
- Historical backfill of `finished` status for the already-exhausted campaigns 1–5 (can be a one-off follow-up if wanted).
- Per-vertical breakdown in the heartbeat (the existing heartbeat already carries 7d funnel rates).
