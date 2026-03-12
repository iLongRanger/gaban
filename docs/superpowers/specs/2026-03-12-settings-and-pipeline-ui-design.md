# Settings & Pipeline Control Web UI — Design Spec

**Date:** 2026-03-12
**Status:** Draft

## Overview

Add a settings page, pipeline runner, and scheduling to the existing Gaban web UI so that users can configure and trigger lead generation runs entirely from the browser. Currently the pipeline runs via CLI with hardcoded values; this spec makes it fully controllable from the web UI.

## Requirements

- Users can create named **presets** with configurable search parameters
- Users can **run the pipeline** immediately from the UI using any preset
- Users can **schedule** recurring runs with a preset
- **Live log streaming** during pipeline execution
- **Simple PIN protection** on the entire app
- Single-user app, one pipeline run at a time

## Data Model

### `settings` table (new)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto-increment |
| name | TEXT UNIQUE NOT NULL | preset name, e.g. "New West Restaurants" |
| location | TEXT NOT NULL | search location, e.g. "New Westminster, BC" |
| radius_km | INTEGER NOT NULL | search radius in km, default 50 |
| office_lat | REAL NOT NULL | office latitude for distance calc |
| office_lng | REAL NOT NULL | office longitude for distance calc |
| categories | TEXT NOT NULL | JSON array, e.g. `["restaurants", "offices"]` |
| top_n | INTEGER NOT NULL | number of top leads to select, default 4 |
| is_default | INTEGER NOT NULL DEFAULT 0 | 0 or 1, only one preset can be default |
| created_at | TEXT NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT NOT NULL | ISO 8601 timestamp |

### `pipeline_runs` table (new)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto-increment |
| preset_id | INTEGER NOT NULL | FK → settings.id |
| status | TEXT NOT NULL | `pending`, `running`, `completed`, `failed` |
| phase | TEXT | current phase: discovery, filtering, scoring, drafting, export |
| leads_found | INTEGER | result count after completion |
| log | TEXT | full log output, appended during run |
| started_at | TEXT | ISO 8601 timestamp |
| completed_at | TEXT | ISO 8601 timestamp |

### `schedules` table (new)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto-increment |
| preset_id | INTEGER NOT NULL | FK → settings.id |
| cron | TEXT NOT NULL | cron expression, e.g. `0 9 * * 1` |
| enabled | INTEGER NOT NULL DEFAULT 1 | 0 or 1 |
| last_run_at | TEXT | ISO 8601 timestamp |
| next_run_at | TEXT | ISO 8601 timestamp |
| created_at | TEXT NOT NULL | ISO 8601 timestamp |

### Auth

- `APP_PIN` stored in `.env` (e.g. `APP_PIN=1234`)
- `APP_SECRET` in `.env` for signing session cookies
- No database table — middleware checks a signed cookie on every request
- Session cookie set on successful PIN entry

## Pipeline Integration

### CLI changes to `run.js`

Accept a `--config <path>` CLI argument. When provided, load settings from the JSON file at that path instead of from `settings.json` and hardcoded values.

Config JSON shape:
```json
{
  "location": "Vancouver, BC",
  "radius_km": 30,
  "office_lat": 49.2026,
  "office_lng": -122.9106,
  "categories": ["restaurants", "offices"],
  "top_n": 6
}
```

When `--config` is not provided, fall back to current behavior (settings.json + hardcoded values) so the CLI continues to work standalone.

### Spawning from the web UI

1. `POST /api/runs` receives `{ preset_id }`.
2. Server reads the preset from SQLite, writes a temp JSON config file.
3. Spawns `node src/cli/run.js --config /tmp/preset-<id>.json` as a child process.
4. Creates a `pipeline_runs` row with status `running`.
5. Stdout/stderr are captured line-by-line and appended to the `log` column.
6. On process exit code 0 → status `completed`; non-zero → status `failed`.
7. Temp config file is cleaned up.

### Log streaming

- `GET /api/runs/[id]/stream` — Server-Sent Events (SSE) endpoint.
- Client opens an `EventSource` connection and renders log lines as they arrive.
- Pipeline's Winston logger writes to stdout; the child process captures this.
- On disconnect/reconnect, client fetches the full log from `GET /api/runs/[id]`.

### Concurrency guard

Only one pipeline run at a time. If a run is already `running`, `POST /api/runs` returns 409 Conflict. The UI disables the Run button and shows which run is active.

### Scheduling

- `node-cron` library runs inside the Next.js server process.
- On server startup, load all enabled schedules from SQLite and register cron jobs.
- When a cron fires, it triggers the same spawn logic as a manual run.
- If a run is already active when a schedule fires, skip and log a warning.

## API Routes

### Auth

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth` | Verify PIN, set session cookie |
| DELETE | `/api/auth` | Log out, clear cookie |

### Presets

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/presets` | List all presets |
| POST | `/api/presets` | Create preset |
| GET | `/api/presets/[id]` | Get single preset |
| PATCH | `/api/presets/[id]` | Update preset |
| DELETE | `/api/presets/[id]` | Delete preset |

### Runs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/runs` | List all pipeline runs |
| POST | `/api/runs` | Start a run with a preset |
| GET | `/api/runs/[id]` | Get run details + full log |
| GET | `/api/runs/[id]/stream` | SSE endpoint for live log |
| POST | `/api/runs/[id]/cancel` | Kill running pipeline process |

### Schedules

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/schedules` | List all schedules |
| POST | `/api/schedules` | Create schedule |
| PATCH | `/api/schedules/[id]` | Update schedule |
| DELETE | `/api/schedules/[id]` | Delete schedule |

### Auth middleware

- All routes except `POST /api/auth` and `/login` page require a valid session cookie.
- Cookie is signed with `APP_SECRET` from `.env`.
- Invalid/missing cookie → 401 response (API) or redirect to `/login` (pages).

### Error responses

Standard shape: `{ error: "message" }` with appropriate HTTP status codes.

## Web UI Pages

### PIN Lock Screen (`/login`)

- Centered PIN input field
- On correct PIN → sets signed cookie, redirects to `/`
- Middleware on all routes checks cookie, redirects to `/login` if invalid

### Settings Page (`/settings`)

- **Preset list** on the left — card per preset showing name, location, radius, categories
- **Preset editor** on the right — form to create/edit:
  - Name (text input)
  - Search location (text input)
  - Radius km (number slider, range 5–100)
  - Office location lat/lng (two number inputs)
  - Categories (multi-select checkboxes: restaurants, offices, clinics, gyms, schools, retail stores, community centers, industrial facilities)
  - Top N leads (number input, range 1–20)
  - "Set as default" toggle
  - Save / Delete buttons
- **"Run Now" button** on each preset card — triggers pipeline immediately
- **Schedule section** at bottom of each preset — day-of-week + time picker (translated to cron), toggle enabled/disabled

### Runs Page (`/runs`)

- **Run list** — table with: date, preset name, status pill, duration, leads found
- Click a run to expand:
  - **Live log viewer** — monospaced, dark background, auto-scrolling terminal-style output
  - Phase indicator (discovery → filtering → scoring → drafting → export)
  - Result summary on completion
- **Active run banner** at top if a run is in progress, with embedded live log

### Changes to existing pages

- **Weekly Leads** (`/`) and **History** (`/history`) — no changes
- **Layout sidebar** — add Settings and Runs nav items

## Dependencies

- `node-cron` — for scheduled runs (new dependency)
- No other new dependencies needed; cookie signing can use Node.js built-in `crypto`

## Non-Goals

- Multi-user support or role-based access
- Concurrent pipeline runs
- Email/notification on run completion
- Editing scoring weights or drafting prompts from the UI
