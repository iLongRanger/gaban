# Scheduled-Email Calendar View — Design

**Date:** 2026-06-10

## Goal

Give the operator a month-calendar view of upcoming scheduled emails so they can see the **runway** — how many days of scheduled sends remain — and know when to kick off a new lead scrape before the outbound queue runs dry.

## Context

The Halon console already has a `/today` page (`src/web/app/(app)/today/page.tsx`) that lists the single-day scheduled queue from `email_sends` where `status='scheduled'`, ordered by `scheduled_for`, joined through `campaign_leads → campaigns → leads`. This feature zooms out from one day to a full month and adds a runway recommendation. No schema changes.

## Decisions (locked during brainstorming)

- **Layout:** Month grid (Mon–Sun) + a runway banner across the top.
- **Runway logic:** `empties = max(scheduled_for)` local day; `scrape_by = empties − leadTimeDays`. Lead time read from system setting `scrape_lead_time_days`, default **3**. No new settings UI; just read-with-fallback.
- **Which sends count:** ALL rows with `status='scheduled'` (not split by campaign active/paused). Simpler and matches operator intent.
- **Drilldown:** Day cell links to `/today?date=YYYY-MM-DD`.

## Architecture

Three units:

1. **`src/services/scheduleRunway.js`** — pure, dependency-free logic module. Exports `buildCalendarModel(sends, { now, leadTimeDays, timeZone })`.
   - Input `sends`: array of `{ id, scheduled_for }` (ISO UTC strings).
   - Buckets each send into its **local day** (`timeZone`, default `'America/Vancouver'`) as a `YYYY-MM-DD` key.
   - Returns:
     ```
     {
       countsByDay: Map<'YYYY-MM-DD', number>,
       totalScheduled: number,
       emptiesOn: 'YYYY-MM-DD' | null,   // local day of the last scheduled send
       daysOfRunway: number,             // whole local days from `now` to emptiesOn (0 if none)
       scrapeBy: 'YYYY-MM-DD' | null,    // emptiesOn minus leadTimeDays, clamped to >= today
       leadTimeDays: number,
     }
     ```
   - Pure: takes `now` and `timeZone` as inputs (no `Date.now()` inside), so it is deterministic and unit-testable.

2. **`src/web/app/(app)/calendar/page.tsx`** — server component (`export const dynamic = 'force-dynamic'`), thin renderer:
   - Reads `?month=YYYY-MM` (defaults to current Vancouver month).
   - Queries `SELECT id, scheduled_for FROM email_sends WHERE status='scheduled' AND scheduled_for >= <start-of-today-UTC>`.
   - Reads `scrape_lead_time_days` from system settings (fallback 3) via the existing settings accessor.
   - Calls `buildCalendarModel(...)`, renders banner + month grid.

3. **Sidebar nav entry** in `src/web/app/(app)/layout.tsx` — a "Calendar" link alongside the existing items.

A small enhancement to **`src/web/app/(app)/today/page.tsx`**: accept an optional `?date=YYYY-MM-DD` search param and use it instead of "today" when computing the local day range. Default behavior (no param) unchanged.

## Data Flow

```
email_sends (status='scheduled')
   -> page query (future rows only)
   -> buildCalendarModel(sends, { now, leadTimeDays, timeZone })
   -> { countsByDay, emptiesOn, scrapeBy, daysOfRunway, ... }
   -> Runway banner + month grid render
   -> day cell click -> /today?date=YYYY-MM-DD
```

Bucketing is done in JS (not SQL) so the Vancouver-local day boundary is correct. Volume is modest (hundreds of rows), so loading all future scheduled rows is cheap.

## UI

**Runway banner** (top of page):
- Text: `queue empties Jun 18 (8 days) · schedule a scrape by Jun 15`.
- Color states:
  - **accent** — comfortable runway (`scrapeBy` more than 2 days out).
  - **warn** — `scrapeBy` is today, tomorrow, or already past but queue not yet empty.
  - **danger** — queue already empty (`emptiesOn` is null or in the past): "Queue is empty — schedule a scrape now".

**Month grid:**
- Mon–Sun columns, week rows for the selected month.
- Each day cell: date number + scheduled count as a large numeric. Background tint scales with volume (reuse existing `--accent` / frame styles; no new CSS framework).
- Empty days show `-`.
- Today's cell highlighted.
- The `scrapeBy` day carries a distinct marker so it is findable independent of the banner.
- Prev/next month buttons via `?month=YYYY-MM`.

## Error / Edge Handling

- **No scheduled sends:** banner = danger "Queue is empty — schedule a scrape now"; grid renders all `-`; `emptiesOn`/`scrapeBy` = null.
- **`scrape_lead_time_days` missing or non-numeric:** fall back to 3.
- **`scrapeBy` earlier than today:** clamp to today (don't advise a past date) and use warn/danger coloring.
- **Month with no sends but later months populated:** grid renders empty; banner still reflects the true `emptiesOn` across all future rows.

## Testing

`tests/scheduleRunway.test.js` (`node:test`, repo convention):
- Buckets sends into correct Vancouver-local days (incl. a UTC time that crosses midnight in Vancouver).
- `emptiesOn` = last scheduled local day.
- `daysOfRunway` computed from `now` to `emptiesOn`.
- `scrapeBy` = `emptiesOn − leadTimeDays`; clamps to today when that would be in the past.
- Empty input → nulls and `totalScheduled: 0`.
- `leadTimeDays` honored (e.g. 3 vs 5 shifts `scrapeBy`).

Page and nav are thin renderers verified manually (`npm run dev` → `/calendar`).

## Out of Scope

- Triggering a scrape from this page.
- Drag-to-reschedule / editing send times.
- Held-vs-active (paused campaign) split — counts use all scheduled rows.
- Per-campaign or per-vertical filtering.
- A settings-page control for `scrape_lead_time_days` (read-with-fallback only).
