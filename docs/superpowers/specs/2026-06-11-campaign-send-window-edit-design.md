# Editable Campaign Send Window — Design Spec

**Date:** 2026-06-11
**Status:** Implemented

## Problem

A campaign's send window (`send_window_start`, `send_window_end`) is fixed at creation —
in practice every campaign inherits the schema defaults (09:00–17:00). There is no UI or API
to change it afterward, and each touch's `scheduled_for` timestamp is baked in at creation, so
even editing the column directly would not move already-scheduled sends. Operators need to change
the time of day a live campaign's remaining emails go out.

## Goal

Let an operator change a campaign's send window (start/end time) after creation and have the
already-scheduled touches move to the new time **on their existing dates**, preserving the
4/10/21-day touch pacing.

## Scope

**In scope:** editing `send_window_start` and `send_window_end` only.

**Out of scope:** changing `send_days` or `timezone` (left as-is — single Metro Vancouver
operator, Mon–Fri default is fine); creation-time window configuration; per-touch manual time edits.

## Behavior

- Editable while the campaign is **active or paused**. **Finished** campaigns are rejected (they
  have no pending sends).
- Only sends with `status = 'scheduled'` are re-clamped. `sent`, `cancelled`, `failed`, `sending`
  sends are never touched.
- **Re-clamp rule:** each pending send keeps its existing calendar date (in the campaign timezone)
  and moves to the new window **start** time on that date. Same-day collisions are spread by the
  existing 2-minute min-gap, consistent with `scheduleSequence`. If a send's date falls on a
  non-send weekday it bumps to the next allowed day (unchanged `send_days` makes this rare).
- Updating the columns also means any later `resume`/`reschedulePendingSends` uses the new window.

## Architecture & Components

### 1. `CampaignService.updateSendWindow(id, { sendWindowStart, sendWindowEnd })`
- Validates both values are `HH:MM` (reuse the scheduler's `parseTime`) and that
  `sendWindowStart` is strictly before `sendWindowEnd`. Throws on invalid input.
- Loads the campaign; returns `null` if it does not exist or its status is `finished`.
- In one `db.transaction`: updates `send_window_start`, `send_window_end`, `updated_at`; then
  re-clamps all pending sends for the campaign into the new window.
- Returns the updated campaign (same shape as `getCampaign`).

### 2. Re-clamp helper (in `sequenceScheduler.js`)
- Add an exported helper that, given an existing UTC ISO timestamp and scheduler options,
  returns the new UTC time on the **same local date** at the window start (respecting
  `send_days`/timezone via the existing tz utilities). The module already has the private
  `partsInTimeZone` / `wallTimeToUtc` / `nextSendTime` machinery; the helper reuses them rather
  than duplicating tz math.
- `updateSendWindow` walks the campaign's pending sends ordered by `scheduled_for`, computes each
  new time with this helper, applies the same min-gap collision avoidance `scheduleSequence` uses
  (including against other campaigns' scheduled times, mirroring `reschedulePendingSends`), and
  writes each new `scheduled_for`.

### 3. `PATCH /api/campaigns/[id]/route.ts`
- Body: `{ send_window_start: string, send_window_end: string }`.
- Calls `updateSendWindow`. Returns `200` with the campaign on success, `400` on invalid time
  (caught from the thrown validation error), `404` if `updateSendWindow` returns null.

### 4. UI
- **Campaign detail page** (`src/web/app/(app)/campaigns/[id]/page.tsx`): display the current
  window (e.g. "Window 09:00–17:00 · Mon–Fri") near the daily-cap stat.
- **`CampaignActions` client component**: add an "Edit schedule" control with two
  `<input type="time">` fields (prefilled with the current window) and a Save button that PATCHes
  the route and refreshes the page. Hidden when status is `finished`. Reuse existing button/input
  styling already in the component.

## Error Handling

- Invalid `HH:MM` or `end <= start` → service throws → route returns `400` with the message.
- Campaign missing or finished → service returns null → route returns `404`.
- Re-clamp runs in a transaction; any failure rolls back leaving the window and schedule unchanged.

## Testing

`tests/campaignService.test.js`:
- updates the window columns and persists them.
- re-clamps pending sends to the new window-start time while keeping their existing dates
  (assert the date part is unchanged and the time part matches the new window start).
- leaves a `sent` send's `scheduled_for` untouched.
- rejects an invalid window (`end <= start`, malformed `HH:MM`) by throwing.
- returns null for a finished campaign and does not modify any send.

(Optional) a `sequenceScheduler.test.js` case for the new helper: same local date, new time at
window start, day-bump when the date is a non-send weekday.

## Out-of-scope / deferred
- Editing send days or timezone.
- Spreading touches across the window rather than clustering at window start.
- Creation-time window configuration in the new-campaign form.
