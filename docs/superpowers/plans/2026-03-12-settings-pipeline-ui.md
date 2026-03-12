# Settings & Pipeline Control UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add presets, pipeline runner with live logs, scheduling, and PIN auth to the Gaban web UI.

**Architecture:** Child process approach — the Next.js API spawns `node src/cli/run.js --config <path>` and streams stdout via SSE. Presets, runs, and schedules stored in SQLite alongside existing tables. PIN auth via signed cookie middleware.

**Tech Stack:** Next.js 16 (App Router), better-sqlite3, node-cron, Node.js crypto (HMAC cookie signing), SSE (Server-Sent Events)

---

## File Structure

### New files
- `src/web/lib/auth.js` — cookie signing/verification helpers
- `src/web/lib/pipelineRunner.ts` — child process spawning, log capture, concurrency guard
- `src/web/lib/scheduler.ts` — node-cron registration, startup loading
- `src/web/app/(auth)/login/page.tsx` — PIN entry page (own layout, no sidebar)
- `src/web/app/(auth)/layout.tsx` — minimal auth layout
- `src/web/app/(app)/layout.tsx` — main layout with sidebar (moved from app/layout.tsx)
- `src/web/app/(app)/settings/page.tsx` — presets management page
- `src/web/app/(app)/runs/page.tsx` — pipeline runs list + live log viewer
- `src/web/app/api/auth/route.ts` — POST (login) / DELETE (logout)
- `src/web/app/api/presets/route.ts` — GET (list) / POST (create)
- `src/web/app/api/presets/[id]/route.ts` — GET / PATCH / DELETE
- `src/web/app/api/runs/route.ts` — GET (list) / POST (start run)
- `src/web/app/api/runs/[id]/route.ts` — GET (details + log)
- `src/web/app/api/runs/[id]/stream/route.ts` — GET (SSE log stream)
- `src/web/app/api/runs/[id]/cancel/route.ts` — POST (kill process)
- `src/web/app/api/schedules/route.ts` — GET / POST
- `src/web/app/api/schedules/[id]/route.ts` — PATCH / DELETE
- `src/web/middleware.ts` — Next.js middleware for auth cookie check
- `tests/auth.test.js` — auth helper tests
- `tests/presets.test.js` — presets CRUD tests
- `tests/pipelineRunner.test.js` — runner spawn/cancel tests
- `tests/scheduler.test.js` — scheduler tests

### Modified files
- `src/web/lib/db.js` — add presets, pipeline_runs, schedules table schemas
- `src/config/categories.js` — add `ALL_CATEGORIES` export
- `src/config/settings.json` — add `search.location` field
- `src/cli/run.js` — accept `--config` flag, merge config on top of settings
- `src/web/app/layout.tsx` — add Settings and Runs nav links
- `.env.example` — add APP_PIN, APP_SECRET
- `package.json` — add node-cron dependency

---

## Chunk 1: Foundation (DB schema, categories, config merge, auth)

### Task 1: Add new table schemas to db.js

**Files:**
- Modify: `src/web/lib/db.js:6-58`

- [ ] **Step 1: Add presets, pipeline_runs, schedules CREATE TABLE statements to the SCHEMA constant**

In `src/web/lib/db.js`, append to the `SCHEMA` string after the `lead_notes` table:

```sql
CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  location TEXT NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 50,
  office_lat REAL NOT NULL,
  office_lng REAL NOT NULL,
  categories TEXT NOT NULL,
  top_n INTEGER NOT NULL DEFAULT 4,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER REFERENCES presets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT,
  leads_found INTEGER,
  log TEXT DEFAULT '',
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 2: Verify schema loads without errors**

Run: `node -e "import('./src/web/lib/db.js').then(m => { m.initDb(); console.log('OK'); })"`
Expected: `OK` printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/lib/db.js
git commit -m "feat: add presets, pipeline_runs, schedules tables to schema"
```

---

### Task 2: Add ALL_CATEGORIES export to categories.js

**Files:**
- Modify: `src/config/categories.js`
- Test: `tests/categories.test.js`

- [ ] **Step 1: Write test for ALL_CATEGORIES**

Create `tests/categories.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CATEGORIES, CATEGORY_SCHEDULE } from '../src/config/categories.js';

describe('ALL_CATEGORIES', () => {
  it('contains all unique categories from the schedule', () => {
    const expected = [...new Set(CATEGORY_SCHEDULE.flat())];
    assert.deepStrictEqual(ALL_CATEGORIES.sort(), expected.sort());
  });

  it('has no duplicates', () => {
    assert.strictEqual(ALL_CATEGORIES.length, new Set(ALL_CATEGORIES).size);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/categories.test.js`
Expected: FAIL — `ALL_CATEGORIES` is not exported.

- [ ] **Step 3: Add ALL_CATEGORIES export**

Add to the end of `src/config/categories.js`:

```js
export const ALL_CATEGORIES = [...new Set(CATEGORY_SCHEDULE.flat())];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/categories.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/categories.js tests/categories.test.js
git commit -m "feat: add ALL_CATEGORIES export to categories"
```

---

### Task 3: Add search.location to settings.json and update run.js to use it

**Files:**
- Modify: `src/config/settings.json`
- Modify: `src/cli/run.js:21-25,82-88`

- [ ] **Step 1: Add location field to settings.json**

In `src/config/settings.json`, add `"location": "New Westminster, BC"` inside the `"search"` object:

```json
{
  "search": {
    "location": "New Westminster, BC",
    "radius_km": 50,
    "limit_per_category": 50,
    "language": "en",
    "region": "CA"
  },
```

- [ ] **Step 2: Update run.js to read location from settings instead of hardcoding**

In `src/cli/run.js`, change line 84 from:

```js
    location: 'New Westminster, BC',
```

to:

```js
    location: settings.search.location,
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/config/settings.json src/cli/run.js
git commit -m "refactor: move search location from hardcoded to settings.json"
```

---

### Task 4: Add --config flag to run.js

**Files:**
- Modify: `src/cli/run.js`
- Test: `tests/configMerge.test.js`

- [ ] **Step 1: Write test for config merging logic**

Create `tests/configMerge.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../src/cli/run.js';

describe('mergeConfig', () => {
  const base = {
    search: { location: 'New Westminster, BC', radius_km: 50, limit_per_category: 50, language: 'en', region: 'CA' },
    scoring: { model: 'claude-haiku-4-5-20251001', top_n: 4 },
    drafting: { model: 'claude-haiku-4-5-20251001' },
    office_location: { lat: 49.2026, lng: -122.9106 },
    filters: { require_contact: true },
    operational: { dry_run: false }
  };

  it('returns base settings when no override provided', () => {
    const result = mergeConfig(base, null);
    assert.deepStrictEqual(result, base);
  });

  it('overrides nested search fields', () => {
    const override = { search: { location: 'Vancouver, BC', radius_km: 30 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.search.location, 'Vancouver, BC');
    assert.strictEqual(result.search.radius_km, 30);
    assert.strictEqual(result.search.limit_per_category, 50); // preserved
  });

  it('overrides office_location', () => {
    const override = { office_location: { lat: 49.3, lng: -123.0 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.office_location.lat, 49.3);
  });

  it('overrides scoring.top_n', () => {
    const override = { scoring: { top_n: 8 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.scoring.top_n, 8);
    assert.strictEqual(result.scoring.model, 'claude-haiku-4-5-20251001'); // preserved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/configMerge.test.js`
Expected: FAIL — `mergeConfig` is not exported.

- [ ] **Step 3: Implement mergeConfig and --config flag in run.js**

Add `mergeConfig` as an exported function in `src/cli/run.js` (after `loadSettings`):

```js
export function mergeConfig(base, override) {
  if (!override) return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (typeof override[key] === 'object' && !Array.isArray(override[key]) && override[key] !== null) {
      result[key] = { ...base[key], ...override[key] };
    } else {
      result[key] = override[key];
    }
  }
  return result;
}
```

Also guard the auto-execution at the bottom of `run.js` so that importing the module for tests doesn't trigger the pipeline:

```js
// At the bottom of run.js, replace:
//   run().catch(...);
// with:
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  run().catch((error) => {
    logger.error(`Run failed: ${error.message}`);
    process.exit(1);
  });
}
```

Then update the `run()` function to parse `--config`:

```js
async function run() {
  dotenv.config();
  let settings = await loadSettings();

  // Parse --config flag
  const configFlagIndex = process.argv.indexOf('--config');
  if (configFlagIndex !== -1 && process.argv[configFlagIndex + 1]) {
    const configPath = process.argv[configFlagIndex + 1];
    const raw = await fs.readFile(configPath, 'utf-8');
    const override = JSON.parse(raw);
    settings = mergeConfig(settings, override);
  }

  logger.info('=== Gleam Lead Scraper - Weekly Run ===');
  // ... rest of run()
```

Also update the categories logic (around line 74) to use override categories if provided:

```js
  const categories = settings.categories || getCategoriesForWeek(weekNum);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/configMerge.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/run.js tests/configMerge.test.js
git commit -m "feat: add --config flag and mergeConfig to run.js"
```

---

### Task 5: Auth helpers (cookie signing/verification)

**Files:**
- Create: `src/web/lib/auth.js`
- Test: `tests/auth.test.js`

- [ ] **Step 1: Write tests for auth helpers**

Create `tests/auth.test.js`:

```js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Set env vars before importing
process.env.APP_PIN = '1234';
process.env.APP_SECRET = 'test-secret-key-for-testing';

const { verifyPin, createSessionCookie, verifySessionCookie } = await import('../src/web/lib/auth.js');

describe('auth helpers', () => {
  it('verifyPin returns true for correct PIN', () => {
    assert.strictEqual(verifyPin('1234'), true);
  });

  it('verifyPin returns false for wrong PIN', () => {
    assert.strictEqual(verifyPin('0000'), false);
  });

  it('createSessionCookie returns a string', () => {
    const cookie = createSessionCookie();
    assert.strictEqual(typeof cookie, 'string');
    assert.ok(cookie.length > 0);
  });

  it('verifySessionCookie validates a valid cookie', () => {
    const cookie = createSessionCookie();
    assert.strictEqual(verifySessionCookie(cookie), true);
  });

  it('verifySessionCookie rejects a tampered cookie', () => {
    assert.strictEqual(verifySessionCookie('tampered-value'), false);
  });

  it('verifySessionCookie rejects empty string', () => {
    assert.strictEqual(verifySessionCookie(''), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement auth helpers**

Create `src/web/lib/auth.js`:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('APP_SECRET env var is required');
  return secret;
}

export function verifyPin(pin) {
  const expected = process.env.APP_PIN;
  if (!expected) throw new Error('APP_PIN env var is required');
  return pin === expected;
}

export function createSessionCookie() {
  const payload = 'gaban-session';
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionCookie(cookie) {
  if (!cookie || !cookie.includes('.')) return false;
  const [payload, sig] = cookie.split('.');
  const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/auth.js tests/auth.test.js
git commit -m "feat: add auth helpers for PIN verification and cookie signing"
```

---

### Task 6: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add APP_PIN and APP_SECRET to .env.example**

Append to `.env.example`:

```
# Web UI authentication
APP_PIN=1234
APP_SECRET=change-me-to-a-random-string
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add APP_PIN and APP_SECRET to .env.example"
```

---

### Task 7: Install node-cron dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install node-cron**

Run: `npm install node-cron`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add node-cron for scheduled pipeline runs"
```

---

## Chunk 2: API Routes (auth, presets, runs, schedules)

### Task 8: Auth API route

**Files:**
- Create: `src/web/app/api/auth/route.ts`

- [ ] **Step 1: Create auth route with POST and DELETE**

Create `src/web/app/api/auth/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyPin, createSessionCookie } from '@/lib/auth.js';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pin } = body;

  if (!pin || !verifyPin(pin)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  const cookie = createSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set('gaban-session', cookie, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('gaban-session');
  return response;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/app/api/auth/route.ts
git commit -m "feat: add auth API route for PIN login/logout"
```

---

### Task 9: Next.js auth middleware

**Files:**
- Create: `src/web/middleware.ts`

- [ ] **Step 1: Create middleware for cookie-based auth check**

Create `src/web/middleware.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/auth.js';

export const runtime = 'nodejs'; // Required: auth uses node:crypto

const PUBLIC_PATHS = ['/login', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('gaban-session')?.value;
  const isValid = cookie ? verifySessionCookie(cookie) : false;

  if (!isValid) {
    // API routes get 401, pages get redirected
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/web/middleware.ts
git commit -m "feat: add auth middleware for cookie-based session check"
```

---

### Task 10: Presets API routes

**Files:**
- Create: `src/web/app/api/presets/route.ts`
- Create: `src/web/app/api/presets/[id]/route.ts`
- Test: `tests/presets.test.js`

- [ ] **Step 1: Write tests for presets CRUD**

Create `tests/presets.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../src/web/lib/db.js';

describe('presets table', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('inserts and retrieves a preset', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'Test Preset', 'Vancouver, BC', 30, 49.2, -123.1, '["restaurants"]', 4, now, now
    );

    const preset = db.prepare('SELECT * FROM presets WHERE name = ?').get('Test Preset');
    assert.strictEqual(preset.name, 'Test Preset');
    assert.strictEqual(preset.location, 'Vancouver, BC');
    assert.strictEqual(preset.radius_km, 30);
  });

  it('enforces unique preset names', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run('Dupe', 'A', 50, 49, -123, '[]', 4, now, now);
    assert.throws(() => {
      stmt.run('Dupe', 'B', 50, 49, -123, '[]', 4, now, now);
    });
  });

  it('is_default clears others in transaction', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run('A', 'X', 50, 49, -123, '[]', 4, 1, now, now);
    stmt.run('B', 'Y', 50, 49, -123, '[]', 4, 0, now, now);

    const setDefault = db.transaction((id) => {
      db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
      db.prepare('UPDATE presets SET is_default = 1 WHERE id = ?').run(id);
    });

    const presetB = db.prepare('SELECT id FROM presets WHERE name = ?').get('B');
    setDefault(presetB.id);

    const a = db.prepare('SELECT is_default FROM presets WHERE name = ?').get('A');
    const b = db.prepare('SELECT is_default FROM presets WHERE name = ?').get('B');
    assert.strictEqual(a.is_default, 0);
    assert.strictEqual(b.is_default, 1);
  });

  it('ON DELETE SET NULL for pipeline_runs', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'X', 50, 49, -123, '[]', 4, now, now);
    const preset = db.prepare('SELECT id FROM presets WHERE name = ?').get('P');
    db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'completed', ?)`).run(preset.id, now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const run = db.prepare('SELECT preset_id FROM pipeline_runs').get();
    assert.strictEqual(run.preset_id, null);
  });

  it('ON DELETE CASCADE for schedules', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('P', 'X', 50, 49, -123, '[]', 4, now, now);
    const preset = db.prepare('SELECT id FROM presets WHERE name = ?').get('P');
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, '0 9 * * 1', ?)`).run(preset.id, now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM schedules').get();
    assert.strictEqual(count.c, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/presets.test.js`
Expected: FAIL — presets table does not exist (if schema not yet applied, tests will fail on INSERT).

- [ ] **Step 3: Verify tests pass with the schema from Task 1**

Run: `node --test tests/presets.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 4: Create presets list/create route**

Create `src/web/app/api/presets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { ALL_CATEGORIES } from '../../../../config/categories.js';

export function GET() {
  const db = getDb();
  const presets = db.prepare('SELECT * FROM presets ORDER BY created_at DESC').all();
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const { name, location, radius_km, office_lat, office_lng, categories, top_n, is_default } = body;

  // Validate required fields
  if (!name || !location || !categories || !Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'name, location, and categories are required' }, { status: 400 });
  }

  // Validate categories against known list
  const invalid = categories.filter((c: string) => !ALL_CATEGORIES.includes(c));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown categories: ${invalid.join(', ')}` }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    const insert = db.transaction(() => {
      if (is_default) {
        db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
      }
      return db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, location,
        radius_km ?? 50,
        office_lat ?? 49.2026,
        office_lng ?? -122.9106,
        JSON.stringify(categories),
        top_n ?? 4,
        is_default ? 1 : 0,
        now, now
      );
    });

    const result = insert();
    const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(preset, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'A preset with that name already exists' }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Create presets detail/update/delete route**

Create `src/web/app/api/presets/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { ALL_CATEGORIES } from '../../../../../config/categories.js';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }
  return NextResponse.json(preset);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, location, radius_km, office_lat, office_lng, categories, top_n, is_default } = body;

  // Validate categories if provided
  if (categories) {
    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: 'categories must be a non-empty array' }, { status: 400 });
    }
    const invalid = categories.filter((c: string) => !ALL_CATEGORIES.includes(c));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Unknown categories: ${invalid.join(', ')}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  const update = db.transaction(() => {
    if (is_default) {
      db.prepare('UPDATE presets SET is_default = 0 WHERE is_default = 1').run();
    }
    db.prepare(`UPDATE presets SET
      name = ?, location = ?, radius_km = ?, office_lat = ?, office_lng = ?,
      categories = ?, top_n = ?, is_default = ?, updated_at = ?
      WHERE id = ?`).run(
      name ?? existing.name,
      location ?? existing.location,
      radius_km ?? existing.radius_km,
      office_lat ?? existing.office_lat,
      office_lng ?? existing.office_lng,
      categories ? JSON.stringify(categories) : existing.categories,
      top_n ?? existing.top_n,
      is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
      now, id
    );
  });

  update();
  const updated = db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/web/app/api/presets/ tests/presets.test.js
git commit -m "feat: add presets CRUD API routes and tests"
```

---

### Task 11: Pipeline runner (child process spawning + concurrency)

**Files:**
- Create: `src/web/lib/pipelineRunner.ts`
- Test: `tests/pipelineRunner.test.js`

- [ ] **Step 1: Write tests for pipeline runner**

Create `tests/pipelineRunner.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

// We test the runner logic with the DB, not the actual child process
describe('pipeline runner DB operations', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Test', 'Vancouver', 30, 49.2, -123.1, '["restaurants"]', 4, now, now);
  });

  it('creates a pipeline_runs row with running status', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'running', ?)`).run(preset.id, now);
    const run = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(result.lastInsertRowid);
    assert.strictEqual(run.status, 'running');
    assert.strictEqual(run.preset_id, preset.id);
  });

  it('detects concurrent run via status check', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO pipeline_runs (preset_id, status, started_at) VALUES (?, 'running', ?)`).run(preset.id, now);
    const active = db.prepare("SELECT id FROM pipeline_runs WHERE status = 'running'").get();
    assert.ok(active, 'Should find an active run');
  });

  it('appends to log column', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO pipeline_runs (preset_id, status, log, started_at) VALUES (?, 'running', '', ?)`).run(preset.id, now);
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run('line 1\n', result.lastInsertRowid);
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run('line 2\n', result.lastInsertRowid);
    const run = db.prepare('SELECT log FROM pipeline_runs WHERE id = ?').get(result.lastInsertRowid);
    assert.strictEqual(run.log, 'line 1\nline 2\n');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/pipelineRunner.test.js`
Expected: PASS

- [ ] **Step 3: Implement pipelineRunner.ts**

Create `src/web/lib/pipelineRunner.ts`:

```ts
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb } from './db.js';

let activeProcess: ChildProcess | null = null;
let activeRunId: number | null = null;

// Event listeners for log streaming
type LogListener = (line: string) => void;
const listeners = new Map<number, Set<LogListener>>();

export function getActiveRunId(): number | null {
  return activeRunId;
}

export function addLogListener(runId: number, listener: LogListener) {
  if (!listeners.has(runId)) listeners.set(runId, new Set());
  listeners.get(runId)!.add(listener);
}

export function removeLogListener(runId: number, listener: LogListener) {
  listeners.get(runId)?.delete(listener);
}

function notifyListeners(runId: number, line: string) {
  listeners.get(runId)?.forEach(fn => fn(line));
}

export function startRun(presetId: number): { runId: number } | { error: string; status: number } {
  const db = getDb();

  // Concurrency guard
  const active = db.prepare("SELECT id FROM pipeline_runs WHERE status = 'running'").get() as any;
  if (active) {
    return { error: 'A pipeline run is already in progress', status: 409 };
  }

  // Load preset
  const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(presetId) as any;
  if (!preset) {
    return { error: 'Preset not found', status: 404 };
  }

  // Write temp config file
  const categories = JSON.parse(preset.categories);
  const config = {
    search: { location: preset.location, radius_km: preset.radius_km },
    office_location: { lat: preset.office_lat, lng: preset.office_lng },
    categories,
    scoring: { top_n: preset.top_n },
  };
  const tmpPath = path.join(os.tmpdir(), `gaban-preset-${presetId}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(config));

  // Create run record
  const now = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO pipeline_runs (preset_id, status, log, started_at) VALUES (?, 'running', '', ?)"
  ).run(presetId, now);
  const runId = Number(result.lastInsertRowid);
  activeRunId = runId;

  // Spawn child process
  const runJsPath = path.resolve(process.cwd(), 'src/cli/run.js');
  const child = spawn('node', [runJsPath, '--config', tmpPath], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeProcess = child;

  const appendLog = (data: Buffer) => {
    const line = data.toString();
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run(line, runId);
    notifyListeners(runId, line);
  };

  child.stdout?.on('data', appendLog);
  child.stderr?.on('data', appendLog);

  child.on('close', (code) => {
    // Don't overwrite 'cancelled' status set by cancelRun
    const currentRun = db.prepare("SELECT status FROM pipeline_runs WHERE id = ?").get(runId) as any;
    if (currentRun?.status !== 'cancelled') {
      const status = code === 0 ? 'completed' : 'failed';
      const completedAt = new Date().toISOString();
      db.prepare(
        "UPDATE pipeline_runs SET status = ?, completed_at = ? WHERE id = ?"
      ).run(status, completedAt, runId);
    }
    activeProcess = null;
    activeRunId = null;
    listeners.delete(runId);

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  return { runId };
}

export function cancelRun(runId: number): { ok: boolean } | { error: string; status: number } {
  if (activeRunId !== runId || !activeProcess) {
    return { error: 'No active run with that ID', status: 404 };
  }

  // Set cancelled status before killing, so the close handler in startRun won't overwrite it
  const db = getDb();
  db.prepare("UPDATE pipeline_runs SET status = 'cancelled', completed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), runId);

  activeProcess.kill('SIGTERM');

  // Force kill after 5 seconds
  setTimeout(() => {
    if (activeProcess && !activeProcess.killed) {
      activeProcess.kill('SIGKILL');
    }
  }, 5000);

  return { ok: true };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/web/lib/pipelineRunner.ts tests/pipelineRunner.test.js
git commit -m "feat: add pipeline runner with child process spawn and concurrency guard"
```

---

### Task 12: Runs API routes

**Files:**
- Create: `src/web/app/api/runs/route.ts`
- Create: `src/web/app/api/runs/[id]/route.ts`
- Create: `src/web/app/api/runs/[id]/stream/route.ts`
- Create: `src/web/app/api/runs/[id]/cancel/route.ts`

- [ ] **Step 1: Create runs list + start route**

Create `src/web/app/api/runs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { startRun } from '@/lib/pipelineRunner';

export function GET(request: NextRequest) {
  const db = getDb();
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  const runs = db.prepare(
    `SELECT r.*, p.name as preset_name
     FROM pipeline_runs r
     LEFT JOIN presets p ON r.preset_id = p.id
     ORDER BY r.started_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);

  const total = (db.prepare('SELECT COUNT(*) as count FROM pipeline_runs').get() as any).count;

  return NextResponse.json({ runs, total, page, limit });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset_id } = body;

  if (!preset_id) {
    return NextResponse.json({ error: 'preset_id is required' }, { status: 400 });
  }

  const result = startRun(preset_id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ run_id: result.runId }, { status: 201 });
}
```

- [ ] **Step 2: Create run detail route**

Create `src/web/app/api/runs/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const run = db.prepare(
    `SELECT r.*, p.name as preset_name
     FROM pipeline_runs r
     LEFT JOIN presets p ON r.preset_id = p.id
     WHERE r.id = ?`
  ).get(id);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  return NextResponse.json(run);
}
```

- [ ] **Step 3: Create SSE log stream route**

Create `src/web/app/api/runs/[id]/stream/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db.js';
import { addLogListener, removeLogListener, getActiveRunId } from '@/lib/pipelineRunner';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = parseInt(id);
  const db = getDb();

  const run = db.prepare('SELECT status, log FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!run) {
    return new Response('Run not found', { status: 404 });
  }

  const lastEventId = parseInt(request.headers.get('Last-Event-ID') || '0');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lineIndex = 0;

      // Send existing log lines (from offset if reconnecting)
      if (run.log) {
        const lines = run.log.split('\n').filter((l: string) => l);
        for (const line of lines) {
          lineIndex++;
          if (lineIndex > lastEventId) {
            controller.enqueue(encoder.encode(`id: ${lineIndex}\ndata: ${line}\n\n`));
          }
        }
      }

      // If run is already done, close the stream
      if (run.status !== 'running' || getActiveRunId() !== runId) {
        controller.enqueue(encoder.encode(`event: done\ndata: ${run.status}\n\n`));
        controller.close();
        return;
      }

      // Subscribe to live updates
      const listener = (chunk: string) => {
        const lines = chunk.split('\n').filter(l => l);
        for (const line of lines) {
          lineIndex++;
          controller.enqueue(encoder.encode(`id: ${lineIndex}\ndata: ${line}\n\n`));
        }
      };

      addLogListener(runId, listener);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        removeLogListener(runId, listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Create cancel route**

Create `src/web/app/api/runs/[id]/cancel/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cancelRun } from '@/lib/pipelineRunner';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = cancelRun(parseInt(id));

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/web/app/api/runs/
git commit -m "feat: add runs API routes with SSE streaming and cancel"
```

---

### Task 13: Schedules API routes

**Files:**
- Create: `src/web/app/api/schedules/route.ts`
- Create: `src/web/app/api/schedules/[id]/route.ts`
- Create: `src/web/lib/scheduler.ts`
- Test: `tests/scheduler.test.js`

- [ ] **Step 1: Write tests for scheduler**

Create `tests/scheduler.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

describe('schedules table', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO presets (name, location, radius_km, office_lat, office_lng, categories, top_n, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Test', 'Vancouver', 30, 49.2, -123.1, '["restaurants"]', 4, now, now);
  });

  it('creates a schedule for a preset', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, ?, ?)`).run(preset.id, '0 9 * * 1', now);
    const schedule = db.prepare('SELECT * FROM schedules').get();
    assert.strictEqual(schedule.cron, '0 9 * * 1');
    assert.strictEqual(schedule.enabled, 1);
  });

  it('cascades delete when preset is removed', () => {
    const preset = db.prepare('SELECT id FROM presets LIMIT 1').get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO schedules (preset_id, cron, created_at) VALUES (?, ?, ?)`).run(preset.id, '0 9 * * 1', now);
    db.prepare('DELETE FROM presets WHERE id = ?').run(preset.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM schedules').get();
    assert.strictEqual(count.c, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/scheduler.test.js`
Expected: PASS

- [ ] **Step 3: Implement scheduler.ts**

Create `src/web/lib/scheduler.ts`:

```ts
import cron from 'node-cron';
import { getDb } from './db.js';
import { startRun, getActiveRunId } from './pipelineRunner';

const jobs = new Map<number, cron.ScheduledTask>();

export function registerSchedule(scheduleId: number, cronExpr: string, presetId: number) {
  // Remove existing job if any
  unregisterSchedule(scheduleId);

  const task = cron.schedule(cronExpr, () => {
    if (getActiveRunId() !== null) {
      console.warn(`Skipping scheduled run for preset ${presetId}: another run is active`);
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').run(now, scheduleId);

    startRun(presetId);
  });

  jobs.set(scheduleId, task);
}

export function unregisterSchedule(scheduleId: number) {
  const existing = jobs.get(scheduleId);
  if (existing) {
    existing.stop();
    jobs.delete(scheduleId);
  }
}

export function loadSchedulesOnStartup() {
  const db = getDb();
  const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all() as any[];

  for (const schedule of schedules) {
    if (cron.validate(schedule.cron)) {
      registerSchedule(schedule.id, schedule.cron, schedule.preset_id);
    }
  }

  console.log(`Loaded ${schedules.length} scheduled jobs`);
}

export function stopAllSchedules() {
  for (const [id, task] of jobs) {
    task.stop();
  }
  jobs.clear();
}
```

- [ ] **Step 4: Create schedules list/create route**

Create `src/web/app/api/schedules/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { registerSchedule } from '@/lib/scheduler';
import cron from 'node-cron';

export function GET() {
  const db = getDb();
  const schedules = db.prepare(
    `SELECT s.*, p.name as preset_name
     FROM schedules s
     JOIN presets p ON s.preset_id = p.id
     ORDER BY s.created_at DESC`
  ).all();
  return NextResponse.json(schedules);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  const { preset_id, cron: cronExpr, enabled } = body;

  if (!preset_id || !cronExpr) {
    return NextResponse.json({ error: 'preset_id and cron are required' }, { status: 400 });
  }

  if (!cron.validate(cronExpr)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  // Verify preset exists
  const preset = db.prepare('SELECT id FROM presets WHERE id = ?').get(preset_id);
  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO schedules (preset_id, cron, enabled, created_at) VALUES (?, ?, ?, ?)'
  ).run(preset_id, cronExpr, enabled !== false ? 1 : 0, now);

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);

  // Register if enabled
  if (enabled !== false) {
    registerSchedule(Number(result.lastInsertRowid), cronExpr, preset_id);
  }

  return NextResponse.json(schedule, { status: 201 });
}
```

- [ ] **Step 5: Create schedules update/delete route**

Create `src/web/app/api/schedules/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { registerSchedule, unregisterSchedule } from '@/lib/scheduler';
import cron from 'node-cron';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  const body = await request.json();
  const { cron: cronExpr, enabled } = body;

  if (cronExpr && !cron.validate(cronExpr)) {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const newCron = cronExpr ?? existing.cron;
  const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;

  db.prepare('UPDATE schedules SET cron = ?, enabled = ? WHERE id = ?').run(newCron, newEnabled, id);

  // Re-register or unregister
  if (newEnabled) {
    registerSchedule(Number(id), newCron, existing.preset_id);
  } else {
    unregisterSchedule(Number(id));
  }

  const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  unregisterSchedule(Number(id));
  const result = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/web/lib/scheduler.ts src/web/app/api/schedules/ tests/scheduler.test.js
git commit -m "feat: add scheduler and schedules API routes"
```

---

## Chunk 3: Web UI Pages

### Task 14: Login page

**Files:**
- Create: `src/web/app/login/page.tsx`

- [ ] **Step 1: Create login page**

Create `src/web/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError('Invalid PIN');
      setPin('');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-lg shadow-lg w-80">
        <h1 className="text-xl font-bold text-white mb-6 text-center">Gaban</h1>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          className="w-full px-4 py-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:border-blue-500 focus:outline-none text-center text-lg tracking-widest"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !pin}
          className="w-full mt-4 py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Move login page to a route group with its own root layout**

The login page must NOT inherit the main sidebar layout. Use a Next.js route group:

1. Create `src/web/app/(auth)/login/page.tsx` — move the login page here (same content as above).
2. Create `src/web/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

3. Move the existing `layout.tsx` sidebar layout to `src/web/app/(app)/layout.tsx` and move all other pages (page.tsx, history/, settings/, runs/, api/) into the `(app)` route group so they get the sidebar.
4. Keep `src/web/app/layout.tsx` as a minimal root layout:

```tsx
import './globals.css';

export const metadata = { title: 'Gaban - Lead Manager' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

This ensures `/login` gets a clean layout and all other pages get the sidebar.

- [ ] **Step 3: Verify login page renders**

Run: `npm run dev` and navigate to `http://localhost:3000/login`
Expected: Centered PIN form on dark background, no sidebar.

- [ ] **Step 4: Commit**

```bash
git add src/web/app/login/
git commit -m "feat: add PIN login page"
```

---

### Task 15: Update layout with new nav links

**Files:**
- Modify: `src/web/app/layout.tsx`

- [ ] **Step 1: Add Settings and Runs links to sidebar**

In `src/web/app/layout.tsx`, add two new `<Link>` elements after the History link:

```tsx
          <Link href="/settings" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
            Settings
          </Link>
          <Link href="/runs" className="px-3 py-2 rounded hover:bg-gray-800 transition-colors">
            Runs
          </Link>
```

- [ ] **Step 2: Commit**

```bash
git add src/web/app/layout.tsx
git commit -m "feat: add Settings and Runs nav links to sidebar"
```

---

### Task 16: Settings page (presets management)

**Files:**
- Create: `src/web/app/settings/page.tsx`

- [ ] **Step 1: Create settings page with preset list and editor form**

Create `src/web/app/settings/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';

interface Preset {
  id: number;
  name: string;
  location: string;
  radius_km: number;
  office_lat: number;
  office_lng: number;
  categories: string;
  top_n: number;
  is_default: number;
}

interface Schedule {
  id: number;
  preset_id: number;
  cron: string;
  enabled: number;
}

const ALL_CATEGORIES = [
  'restaurants', 'offices', 'clinics', 'gyms',
  'schools', 'retail stores', 'community centers', 'industrial facilities'
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function cronToUI(cron: string): { day: number; hour: number; minute: number } {
  const parts = cron.split(' ');
  return { minute: parseInt(parts[0]), hour: parseInt(parts[1]), day: parseInt(parts[4]) };
}

function uiToCron(day: number, hour: number, minute: number): string {
  return `${minute} ${hour} * * ${day}`;
}

export default function SettingsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '', location: 'New Westminster, BC', radius_km: 50,
    office_lat: 49.2026, office_lng: -122.9106,
    categories: [] as string[], top_n: 4, is_default: false,
  });
  const [scheduleForm, setScheduleForm] = useState({ day: 1, hour: 9, minute: 0, enabled: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchPresets = useCallback(async () => {
    const res = await fetch('/api/presets');
    if (res.ok) setPresets(await res.json());
  }, []);

  const fetchSchedules = useCallback(async () => {
    const res = await fetch('/api/schedules');
    if (res.ok) setSchedules(await res.json());
  }, []);

  useEffect(() => { fetchPresets(); fetchSchedules(); }, [fetchPresets, fetchSchedules]);

  function selectPreset(preset: Preset) {
    setSelectedId(preset.id);
    const cats = JSON.parse(preset.categories);
    setForm({
      name: preset.name, location: preset.location, radius_km: preset.radius_km,
      office_lat: preset.office_lat, office_lng: preset.office_lng,
      categories: cats, top_n: preset.top_n, is_default: !!preset.is_default,
    });
    const schedule = schedules.find(s => s.preset_id === preset.id);
    if (schedule) {
      const { day, hour, minute } = cronToUI(schedule.cron);
      setScheduleForm({ day, hour, minute, enabled: !!schedule.enabled });
    } else {
      setScheduleForm({ day: 1, hour: 9, minute: 0, enabled: false });
    }
    setError('');
  }

  function resetForm() {
    setSelectedId(null);
    setForm({
      name: '', location: 'New Westminster, BC', radius_km: 50,
      office_lat: 49.2026, office_lng: -122.9106,
      categories: [], top_n: 4, is_default: false,
    });
    setScheduleForm({ day: 1, hour: 9, minute: 0, enabled: false });
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const payload = { ...form, categories: form.categories };
    const method = selectedId ? 'PATCH' : 'POST';
    const url = selectedId ? `/api/presets/${selectedId}` : '/api/presets';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to save');
      setSaving(false);
      return;
    }
    const saved = await res.json();

    // Handle schedule
    const cronExpr = uiToCron(scheduleForm.day, scheduleForm.hour, scheduleForm.minute);
    const existingSchedule = schedules.find(s => s.preset_id === (selectedId || saved.id));
    if (existingSchedule) {
      await fetch(`/api/schedules/${existingSchedule.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: cronExpr, enabled: scheduleForm.enabled }),
      });
    } else if (scheduleForm.enabled) {
      await fetch('/api/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: saved.id, cron: cronExpr, enabled: true }),
      });
    }

    await fetchPresets();
    await fetchSchedules();
    setSelectedId(saved.id);
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedId || !confirm('Delete this preset?')) return;
    await fetch(`/api/presets/${selectedId}`, { method: 'DELETE' });
    resetForm();
    await fetchPresets();
    await fetchSchedules();
  }

  async function handleRunNow(presetId: number) {
    const res = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId }),
    });
    if (res.ok) {
      const data = await res.json();
      window.location.href = `/runs?active=${data.run_id}`;
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to start run');
    }
  }

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Preset list */}
      <div className="w-80 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Presets</h2>
          <button onClick={resetForm} className="text-sm text-blue-600 hover:text-blue-800">+ New</button>
        </div>
        <div className="space-y-2">
          {presets.map(preset => (
            <div
              key={preset.id}
              onClick={() => selectPreset(preset)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === preset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{preset.name}</span>
                {preset.is_default ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span> : null}
              </div>
              <p className="text-xs text-gray-500 mt-1">{preset.location} &middot; {preset.radius_km}km</p>
              <p className="text-xs text-gray-400 mt-0.5">{JSON.parse(preset.categories).join(', ')}</p>
              <button
                onClick={(e) => { e.stopPropagation(); handleRunNow(preset.id); }}
                className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                Run Now
              </button>
            </div>
          ))}
          {presets.length === 0 && <p className="text-sm text-gray-400">No presets yet. Create one to get started.</p>}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">{selectedId ? 'Edit Preset' : 'New Preset'}</h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Location</label>
            <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius: {form.radius_km}km</label>
            <input type="range" min="5" max="100" value={form.radius_km}
              onChange={e => setForm(f => ({ ...f, radius_km: parseInt(e.target.value) }))}
              className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Office Latitude</label>
              <input type="number" step="0.0001" value={form.office_lat}
                onChange={e => setForm(f => ({ ...f, office_lat: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Office Longitude</label>
              <input type="number" step="0.0001" value={form.office_lng}
                onChange={e => setForm(f => ({ ...f, office_lng: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.categories.includes(cat)}
                    onChange={() => toggleCategory(cat)} className="rounded" />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Top N Leads: {form.top_n}</label>
            <input type="number" min="1" max="20" value={form.top_n}
              onChange={e => setForm(f => ({ ...f, top_n: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
            Set as default preset
          </label>

          {/* Schedule section */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">Schedule</h3>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={scheduleForm.enabled}
                onChange={e => setScheduleForm(f => ({ ...f, enabled: e.target.checked }))} className="rounded" />
              Enable scheduled runs
            </label>
            {scheduleForm.enabled && (
              <div className="flex gap-3 items-center">
                <select value={scheduleForm.day}
                  onChange={e => setScheduleForm(f => ({ ...f, day: parseInt(e.target.value) }))}
                  className="px-3 py-2 border border-gray-300 rounded">
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <span className="text-sm text-gray-500">at</span>
                <input type="time" value={`${String(scheduleForm.hour).padStart(2, '0')}:${String(scheduleForm.minute).padStart(2, '0')}`}
                  onChange={e => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setScheduleForm(f => ({ ...f, hour: h, minute: m }));
                  }}
                  className="px-3 py-2 border border-gray-300 rounded" />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name || form.categories.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            {selectedId && (
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify settings page renders**

Run: `npm run dev` and navigate to `http://localhost:3000/settings`
Expected: Preset list on left, editor form on right with all fields.

- [ ] **Step 3: Commit**

```bash
git add src/web/app/settings/
git commit -m "feat: add settings page with preset editor and schedule controls"
```

---

### Task 17: Runs page with live log viewer

**Files:**
- Create: `src/web/app/runs/page.tsx`

- [ ] **Step 1: Create runs page**

Create `src/web/app/runs/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Run {
  id: number;
  preset_name: string | null;
  status: string;
  phase: string | null;
  leads_found: number | null;
  log: string;
  started_at: string;
  completed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  pending: 'bg-blue-100 text-blue-800',
};

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.round((e - s) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRuns = useCallback(async () => {
    const res = await fetch(`/api/runs?page=${page}&limit=20`);
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs);
      setTotal(data.total);
    }
  }, [page]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Refresh list periodically if there's an active run
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  function expandRun(run: Run) {
    // Close existing SSE
    eventSourceRef.current?.close();

    if (expandedId === run.id) {
      setExpandedId(null);
      setLogLines([]);
      return;
    }

    setExpandedId(run.id);
    setLogLines(run.log ? run.log.split('\n').filter(l => l) : []);

    if (run.status === 'running') {
      const es = new EventSource(`/api/runs/${run.id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        setLogLines(prev => [...prev, event.data]);
      };

      es.addEventListener('done', (event) => {
        es.close();
        fetchRuns();
      });

      es.onerror = () => {
        es.close();
      };
    }
  }

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  async function handleCancel(runId: number) {
    await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
    fetchRuns();
  }

  // Check URL for active run redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get('active');
    if (activeId) {
      const id = parseInt(activeId);
      // Fetch this specific run and expand it
      fetch(`/api/runs/${id}`).then(res => res.json()).then(run => {
        if (run.id) {
          setRuns(prev => {
            if (prev.find(r => r.id === id)) return prev;
            return [run, ...prev];
          });
          expandRun(run);
        }
      });
    }
  }, []);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Active run banner */}
      {runs.some(r => r.status === 'running') && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-yellow-800 font-medium">Pipeline running...</span>
          {runs.filter(r => r.status === 'running').map(r => (
            <button key={r.id} onClick={() => handleCancel(r.id)}
              className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
              Cancel
            </button>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Pipeline Runs</h2>

      <div className="space-y-2">
        {runs.map(run => (
          <div key={run.id} className="border border-gray-200 rounded-lg">
            <div
              onClick={() => expandRun(run)}
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[run.status] || ''}`}>
                  {run.status}
                </span>
                <span className="text-sm font-medium">{run.preset_name || 'Deleted preset'}</span>
                <span className="text-xs text-gray-500">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {run.leads_found !== null && <span>{run.leads_found} leads</span>}
                <span>{formatDuration(run.started_at, run.completed_at)}</span>
                <span>{expandedId === run.id ? '\u25B2' : '\u25BC'}</span>
              </div>
            </div>

            {expandedId === run.id && (
              <div className="border-t border-gray-200">
                <div ref={logRef}
                  className="bg-gray-900 text-green-400 p-4 font-mono text-xs max-h-96 overflow-y-auto">
                  {logLines.length === 0 ? (
                    <p className="text-gray-500">No log output yet...</p>
                  ) : (
                    logLines.map((line, i) => <div key={i}>{line}</div>)
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {runs.length === 0 && <p className="text-sm text-gray-400">No pipeline runs yet.</p>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify runs page renders**

Run: `npm run dev` and navigate to `http://localhost:3000/runs`
Expected: Empty state message "No pipeline runs yet." Runs list with pagination when runs exist.

- [ ] **Step 3: Commit**

```bash
git add src/web/app/runs/
git commit -m "feat: add runs page with live log viewer and pagination"
```

---

## Chunk 4: Integration and Final Verification

### Task 18: Load schedules on server startup

**Files:**
- Create: `src/web/instrumentation.ts`

- [ ] **Step 1: Create Next.js instrumentation file to load schedules**

Next.js supports an `instrumentation.ts` file that runs once on server startup. Create `src/web/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('./lib/db.js');
    initDb();
    const { loadSchedulesOnStartup } = await import('./lib/scheduler');
    loadSchedulesOnStartup();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/instrumentation.ts
git commit -m "feat: load scheduled jobs on server startup via instrumentation"
```

---

### Task 19: Update .env with auth variables

**Files:**
- Modify: `.env` (local only, not committed)

- [ ] **Step 1: Add APP_PIN and APP_SECRET to local .env**

Add to your `.env` file:

```
APP_PIN=1234
APP_SECRET=your-random-secret-string-here
```

- [ ] **Step 2: Verify the full flow end-to-end**

1. Run `npm run dev`
2. Navigate to `http://localhost:3000/` — should redirect to `/login`
3. Enter PIN `1234` — should redirect to home page
4. Go to `/settings` — create a preset with name "Test", location "New Westminster, BC", select "restaurants", save
5. Click "Run Now" on the preset card — should redirect to `/runs` with live log streaming
6. Verify log output appears in the terminal-style viewer
7. After completion, verify leads appear on the home page

Expected: Full flow works with no errors.

---

### Task 20: Run all tests

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new: categories, configMerge, auth, presets, pipelineRunner, scheduler).

- [ ] **Step 2: Fix any failures and commit**

```bash
git add -A
git commit -m "test: ensure all tests pass after settings UI integration"
```
