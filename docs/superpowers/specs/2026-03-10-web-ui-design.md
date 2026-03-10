# Web Application UI Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

A Next.js web application that replaces Google Sheets as the primary interface for reviewing leads, managing outreach, and tracking history. Single-user, runs locally alongside the existing pipeline.

## Goals

- See which leads are highest priority at a glance
- Pick, edit, and copy outreach messages with minimal friction
- Track lead status and view history/trends across weeks

## Non-Goals

- Email/DM sending from the app (copy-paste workflow)
- Pipeline triggering or monitoring (stays external, scheduled)
- Multi-user auth

## Architecture

- **Next.js App Router** — server components for data pages, client components for interactions
- **better-sqlite3** — synchronous SQLite for single-user local use
- **Tailwind CSS** — styling
- **API Routes** — mutations (status updates, draft edits, notes)
- New `sqliteService.js` in the pipeline writes leads + drafts to SQLite after scoring/drafting
- Google Sheets export becomes optional backup

### Project Structure

```
src/
  web/
    app/
      layout.tsx          — sidebar nav
      page.tsx            — weekly leads (home)
      leads/[id]/
        page.tsx          — lead detail
      history/
        page.tsx          — history table
    api/
      leads/
        route.ts
        [id]/route.ts
      drafts/[id]/route.ts
      notes/route.ts
    components/
      LeadCard.tsx
      ScoreBreakdown.tsx
      OutreachEditor.tsx
      StatusPill.tsx
    lib/
      db.ts               — SQLite connection + queries
  services/
    sqliteService.js      — new pipeline export target
```

## Data Model

### `leads`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| place_id | TEXT | Unique, from Google Maps |
| business_name | TEXT | |
| type | TEXT | |
| address | TEXT | |
| phone | TEXT | Nullable |
| website | TEXT | Nullable |
| email | TEXT | Nullable |
| rating | REAL | Nullable |
| reviews_count | INTEGER | Nullable |
| photo_count | INTEGER | Nullable |
| latitude | REAL | |
| longitude | REAL | |
| distance_km | REAL | |
| instagram | TEXT | Nullable |
| facebook | TEXT | Nullable |
| total_score | INTEGER | |
| factor_scores | TEXT | JSON string |
| reasoning | TEXT | |
| status | TEXT | new, contacted, interested, rejected, closed |
| week | TEXT | e.g. 2026-W11 |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### `outreach_drafts`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| lead_id | INTEGER | FK → leads.id |
| style | TEXT | curious_neighbor, value_lead, compliment_question |
| email_subject | TEXT | |
| email_body | TEXT | |
| dm | TEXT | |
| edited_email_body | TEXT | Nullable, user's tweaked version |
| edited_dm | TEXT | Nullable, user's tweaked version |
| selected | INTEGER | Boolean, which style was picked |

### `lead_notes`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, autoincrement |
| lead_id | INTEGER | FK → leads.id |
| content | TEXT | |
| created_at | TEXT | ISO timestamp |

## Pages

### 1. Weekly Leads (Home — `/`)

- Current week's leads sorted by score (highest first)
- Lead cards: business name, type, score badge, distance, status pill
- Click card → navigates to `/leads/[id]`
- Filter by status, sort by score/distance/name
- Week selector dropdown for past weeks

### 2. Lead Detail (`/leads/[id]`)

- Full business info (address, phone, website, socials — clickable links)
- Score breakdown (6 factors as bars/list)
- Three outreach tabs (one per style):
  - View original draft
  - Click "Edit" for inline editing → saves to edited fields
  - "Reset" reverts to original
  - "Copy" copies current version to clipboard, marks draft as selected, auto-sets lead status to contacted
- Status dropdown
- Notes section with add/view

### 3. History (`/history`)

- Table of all leads across all weeks
- Search by business name/address
- Filter by status, week, score range (slider)
- Filters combine with AND logic
- Quick stats at top: total leads, contacted rate, conversion to interested

## Key Interactions

### Outreach Workflow

1. View lead detail
2. Browse three draft style tabs
3. Optionally edit inline (saved to `edited_email_body`/`edited_dm`)
4. Click "Copy" → clipboard, draft marked `selected`, lead status → `contacted`
5. "Reset" available to revert edits

### Status Management

- Dropdown on detail page and inline on lead cards
- Updates `updated_at` timestamp
- Color-coded pills:
  - `new` — blue
  - `contacted` — yellow
  - `interested` — green
  - `rejected` — gray
  - `closed` — purple

### Pipeline Integration

- New `sqliteService.js` writes to SQLite after Phase 4 (drafting)
- Runs alongside or instead of `sheetsService.js`
- `seen_leads.json` dedup store continues unchanged
