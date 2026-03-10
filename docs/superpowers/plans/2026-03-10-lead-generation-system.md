# Lead Generation System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated weekly lead generation pipeline that discovers commercial facilities via Outscraper, scores them with Claude Haiku, drafts personalized outreach, and exports results to Google Sheets.

**Architecture:** 5 sequential phases (Discovery → Filtering → Scoring → Drafting → Export) orchestrated by a single CLI entry point. Each phase is an independent service class. A local JSON file tracks seen leads for deduplication. Windows Task Scheduler triggers the script weekly.

**Tech Stack:** Node.js (ES modules), Outscraper API, Anthropic Claude Haiku API, Google Sheets API (googleapis), Winston logging

**Spec:** `docs/superpowers/specs/2026-03-10-lead-generation-system-design.md`

---

## File Structure

```
src/
  cli/
    run.js                    (MODIFY - new orchestration flow)
  config/
    settings.json             (MODIFY - new config shape)
    categories.js             (CREATE - category rotation logic)
    chains.js                 (CREATE - known chain/franchise list)
  services/
    discoveryService.js       (REPLACE - Outscraper instead of Google Places)
    filteringService.js       (MODIFY - add chain detection, dedup, closed status)
    scoringService.js         (CREATE - Claude Haiku lead scoring)
    draftingService.js        (CREATE - Claude Haiku outreach drafting)
    sheetsService.js          (CREATE - Google Sheets export)
  utils/
    geo.js                    (KEEP - no changes)
    logger.js                 (KEEP - no changes)
    seenLeads.js              (CREATE - read/write seen_leads.json)
data/
  seen_leads.json             (CREATE - deduplication store, gitignored)
tests/
  geo.test.js                 (KEEP - no changes)
  categories.test.js          (CREATE)
  chains.test.js              (CREATE)
  filteringService.test.js    (CREATE)
  scoringService.test.js      (CREATE)
  draftingService.test.js     (CREATE)
  sheetsService.test.js       (CREATE)
  seenLeads.test.js           (CREATE)
  discoveryService.test.js    (CREATE)
  integration.test.js         (CREATE - end-to-end dry run)
```

---

## Chunk 1: Foundation — Config, Dependencies, and Utilities

### Task 1: Update package.json with new dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

```bash
cd A:/Projects/gaban
npm install outscraper @anthropic-ai/sdk googleapis
```

- [ ] **Step 2: Remove old Google Places dependency**

```bash
npm uninstall @googlemaps/google-maps-services-js
```

- [ ] **Step 3: Add npm scripts to package.json**

Add to the `"scripts"` section:
```json
{
  "scripts": {
    "start": "node src/cli/run.js",
    "test": "node --test tests/",
    "test:watch": "node --test --watch tests/"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update dependencies for outscraper, claude, sheets"
```

---

### Task 2: Create category rotation module

**Files:**
- Create: `src/config/categories.js`
- Create: `tests/categories.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/categories.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoriesForWeek, CATEGORY_SCHEDULE } from '../src/config/categories.js';

test('getCategoriesForWeek returns correct categories for week 1', () => {
  const result = getCategoriesForWeek(1);
  assert.deepStrictEqual(result, ['restaurants', 'offices']);
});

test('getCategoriesForWeek returns correct categories for week 4', () => {
  const result = getCategoriesForWeek(4);
  assert.deepStrictEqual(result, ['community centers', 'industrial facilities']);
});

test('getCategoriesForWeek wraps around after week 4', () => {
  const result = getCategoriesForWeek(5);
  assert.deepStrictEqual(result, getCategoriesForWeek(1));
});

test('getCategoriesForWeek handles week 0 by wrapping to week 4', () => {
  const result = getCategoriesForWeek(0);
  assert.deepStrictEqual(result, getCategoriesForWeek(4));
});

test('CATEGORY_SCHEDULE has 4 entries', () => {
  assert.equal(CATEGORY_SCHEDULE.length, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/categories.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/config/categories.js

export const CATEGORY_SCHEDULE = [
  ['restaurants', 'offices'],
  ['clinics', 'gyms'],
  ['schools', 'retail stores'],
  ['community centers', 'industrial facilities']
];

export function getCategoriesForWeek(weekNumber) {
  const index = ((weekNumber - 1) % CATEGORY_SCHEDULE.length + CATEGORY_SCHEDULE.length) % CATEGORY_SCHEDULE.length;
  return CATEGORY_SCHEDULE[index];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/categories.test.js
```
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/categories.js tests/categories.test.js
git commit -m "feat: add category rotation module"
```

---

### Task 3: Create chain/franchise detection list

**Files:**
- Create: `src/config/chains.js`
- Create: `tests/chains.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/chains.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isChain } from '../src/config/chains.js';

test('isChain detects exact chain name', () => {
  assert.equal(isChain('McDonald\'s'), true);
});

test('isChain detects chain name case-insensitive', () => {
  assert.equal(isChain('starbucks'), true);
});

test('isChain detects chain as substring', () => {
  assert.equal(isChain('Tim Hortons #1234'), true);
});

test('isChain returns false for independent business', () => {
  assert.equal(isChain('Joe\'s Bistro'), false);
});

test('isChain returns false for empty string', () => {
  assert.equal(isChain(''), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/chains.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/config/chains.js

const KNOWN_CHAINS = [
  'mcdonald\'s', 'starbucks', 'tim hortons', 'subway', 'burger king',
  'wendy\'s', 'a&w', 'kfc', 'popeyes', 'taco bell', 'pizza hut',
  'domino\'s', 'papa john\'s', 'little caesars', 'five guys',
  'chipotle', 'panda express', 'chick-fil-a', 'dairy queen',
  'dunkin\'', 'baskin-robbins', 'cold stone', 'boston pizza',
  'the keg', 'earls', 'cactus club', 'joey', 'white spot',
  'denny\'s', 'ihop', 'applebee\'s', 'olive garden', 'red lobster',
  'swiss chalet', 'harvey\'s', 'mary brown\'s', 'church\'s chicken',
  'arby\'s', 'sonic', 'jack in the box', 'carl\'s jr',
  'wingstop', 'buffalo wild wings', 'hooters', 'red robin',
  'montana\'s', 'milestones', 'moxie\'s', 'original joe\'s',
  'panera bread', 'nando\'s', 'freshii', 'mucho burrito',
  'qdoba', 'el pollo loco', 'raising cane\'s',
  'anytime fitness', 'goodlife fitness', 'planet fitness',
  'gold\'s gym', 'orangetheory', 'f45 training', 'curves',
  'snap fitness', 'world gym', 'fit4less',
  '7-eleven', 'circle k', 'shoppers drug mart', 'london drugs',
  'walmart', 'costco', 'canadian tire', 'home depot', 'lowe\'s',
  'staples', 'best buy', 'dollarama', 'winners', 'marshalls',
  'value village', 'salvation army thrift',
  'rexall', 'jean coutu', 'pharmasave',
  'kumon', 'sylvan learning', 'oxford learning',
  'regus', 'wework', 'spaces',
  'servicemaster', 'jani-king', 'coverall', 'jan-pro',
  'molly maid', 'merry maids', 'maid brigade'
];

export function isChain(businessName) {
  if (!businessName) return false;
  const lower = businessName.toLowerCase();
  return KNOWN_CHAINS.some(chain => lower.includes(chain));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/chains.test.js
```
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/chains.js tests/chains.test.js
git commit -m "feat: add chain/franchise detection module"
```

---

### Task 4: Create seen leads persistence module

**Files:**
- Create: `src/utils/seenLeads.js`
- Create: `tests/seenLeads.test.js`
- Create: `data/` directory
- Modify: `.gitignore` (add `data/seen_leads.json`)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/seenLeads.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSeenLeads, saveSeenLeads, hasBeenSeen, markAsSeen } from '../src/utils/seenLeads.js';

const TEST_FILE = path.resolve('tests/fixtures/test_seen_leads.json');

test.beforeEach(async () => {
  await fs.mkdir(path.dirname(TEST_FILE), { recursive: true });
  try { await fs.unlink(TEST_FILE); } catch {}
});

test.afterEach(async () => {
  try { await fs.unlink(TEST_FILE); } catch {}
});

test('loadSeenLeads returns empty object when file does not exist', async () => {
  const result = await loadSeenLeads(TEST_FILE);
  assert.deepStrictEqual(result, {});
});

test('saveSeenLeads writes and loadSeenLeads reads back', async () => {
  const data = { 'place_123': { name: 'Test Biz', first_seen: '2026-03-10', status: 'scored' } };
  await saveSeenLeads(TEST_FILE, data);
  const loaded = await loadSeenLeads(TEST_FILE);
  assert.deepStrictEqual(loaded, data);
});

test('hasBeenSeen returns true for existing place_id', () => {
  const seen = { 'place_123': { name: 'Test', first_seen: '2026-03-10', status: 'scored' } };
  assert.equal(hasBeenSeen(seen, 'place_123'), true);
});

test('hasBeenSeen returns false for unknown place_id', () => {
  const seen = {};
  assert.equal(hasBeenSeen(seen, 'place_999'), false);
});

test('markAsSeen adds entry to seen object', () => {
  const seen = {};
  markAsSeen(seen, 'place_456', 'New Biz');
  assert.equal(seen['place_456'].name, 'New Biz');
  assert.equal(seen['place_456'].status, 'scored');
  assert.ok(seen['place_456'].first_seen);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/seenLeads.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/seenLeads.js
import fs from 'node:fs/promises';

export async function loadSeenLeads(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveSeenLeads(filePath, data) {
  await fs.mkdir(new URL('.', `file:///${filePath.replace(/\\/g, '/')}`).pathname.replace(/^\/([A-Z]:)/, '$1'), { recursive: true }).catch(() => {});
  const dir = filePath.substring(0, filePath.lastIndexOf('/') === -1 ? filePath.lastIndexOf('\\') : filePath.lastIndexOf('/'));
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function hasBeenSeen(seenLeads, placeId) {
  return placeId in seenLeads;
}

export function markAsSeen(seenLeads, placeId, businessName) {
  seenLeads[placeId] = {
    name: businessName,
    first_seen: new Date().toISOString().split('T')[0],
    status: 'scored'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/seenLeads.test.js
```
Expected: All 5 tests PASS

- [ ] **Step 5: Create data directory and update .gitignore**

```bash
mkdir -p data
echo '{}' > data/seen_leads.json
```

Add to `.gitignore` (create if it doesn't exist):
```
node_modules/
.env
data/seen_leads.json
logs/
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/seenLeads.js tests/seenLeads.test.js .gitignore
git commit -m "feat: add seen leads persistence module"
```

---

### Task 5: Update settings.json for new config shape

**Files:**
- Modify: `src/config/settings.json`

- [ ] **Step 1: Replace settings.json with new configuration**

```json
{
  "search": {
    "radius_km": 50,
    "limit_per_category": 50,
    "language": "en",
    "region": "CA"
  },
  "filters": {
    "require_contact": true
  },
  "scoring": {
    "model": "claude-haiku-4-5-20251001",
    "top_n": 4
  },
  "drafting": {
    "model": "claude-haiku-4-5-20251001"
  },
  "office_location": {
    "lat": 49.2026,
    "lng": -122.9106
  },
  "operational": {
    "dry_run": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config/settings.json
git commit -m "chore: update settings.json for new pipeline config"
```

---

## Chunk 2: Discovery Service (Outscraper)

### Task 6: Rewrite discovery service with Outscraper

**Files:**
- Replace: `src/services/discoveryService.js`
- Create: `tests/discoveryService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/discoveryService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import DiscoveryService from '../src/services/discoveryService.js';

// Mock Outscraper client
function createMockClient(response) {
  return {
    googleMapsSearch: async () => response
  };
}

const SAMPLE_OUTSCRAPER_RESULT = [[
  {
    query: 'restaurants near New Westminster, BC',
    name: 'Joe\'s Bistro',
    place_id: 'ChIJ_test123',
    full_address: '123 Main St, Burnaby, BC V5H 1A1',
    phone: '+16045551234',
    site: 'https://joesbistro.ca',
    email_1: 'info@joesbistro.ca',
    rating: 4.2,
    reviews: 85,
    type: 'Restaurant',
    subtypes: 'Italian restaurant, Restaurant',
    latitude: 49.2267,
    longitude: -122.8838,
    photo_count: 24,
    working_hours: 'Monday: 11 AM-10 PM',
    business_status: 'OPERATIONAL',
    facebook: 'https://facebook.com/joesbistro',
    instagram: 'https://instagram.com/joesbistro',
    reviews_data: [
      { review_text: 'Great food but floors were a bit sticky', review_rating: 3 }
    ]
  }
]];

test('discoverLeads returns normalized lead objects', async () => {
  const client = createMockClient(SAMPLE_OUTSCRAPER_RESULT);
  const service = new DiscoveryService({ apiKey: 'test', client });

  const leads = await service.discoverLeads({
    categories: ['restaurants'],
    location: 'New Westminster, BC',
    limit: 50,
    language: 'en',
    region: 'CA'
  });

  assert.equal(leads.length, 1);
  assert.equal(leads[0].place_id, 'ChIJ_test123');
  assert.equal(leads[0].business_name, 'Joe\'s Bistro');
  assert.equal(leads[0].email, 'info@joesbistro.ca');
  assert.equal(leads[0].instagram, 'https://instagram.com/joesbistro');
  assert.ok(leads[0].location.lat);
  assert.ok(leads[0].reviews_data);
});

test('discoverLeads queries each category separately', async () => {
  const calls = [];
  const client = {
    googleMapsSearch: async (queries, limit, lang, region) => {
      calls.push(queries);
      return [[]];
    }
  };
  const service = new DiscoveryService({ apiKey: 'test', client });

  await service.discoverLeads({
    categories: ['restaurants', 'offices'],
    location: 'New Westminster, BC',
    limit: 50,
    language: 'en',
    region: 'CA'
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0][0].includes('restaurants'));
  assert.ok(calls[1][0].includes('offices'));
});

test('discoverLeads handles empty results', async () => {
  const client = createMockClient([[]]);
  const service = new DiscoveryService({ apiKey: 'test', client });

  const leads = await service.discoverLeads({
    categories: ['restaurants'],
    location: 'New Westminster, BC',
    limit: 50,
    language: 'en',
    region: 'CA'
  });

  assert.deepStrictEqual(leads, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/discoveryService.test.js
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// src/services/discoveryService.js
import Outscraper from 'outscraper';

export default class DiscoveryService {
  constructor({ apiKey, logger, client } = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.client = client || new Outscraper(apiKey);
  }

  async discoverLeads({ categories, location, limit, language, region }) {
    const allLeads = [];

    for (const category of categories) {
      const query = `${category} near ${location}`;
      this.logger?.info(`Querying Outscraper: "${query}" (limit: ${limit})`);

      try {
        const response = await this.client.googleMapsSearch(
          [query], limit, language, region
        );

        const places = response?.[0] || [];
        const normalized = places.map(place => this.normalize(place));
        allLeads.push(...normalized);

        this.logger?.info(`Found ${normalized.length} results for "${category}".`);
      } catch (error) {
        this.logger?.error(`Outscraper query failed for "${category}": ${error.message}`);
      }
    }

    return allLeads;
  }

  normalize(place) {
    return {
      place_id: place.place_id || null,
      business_name: place.name || null,
      type: place.type || null,
      subtypes: place.subtypes || null,
      formatted_address: place.full_address || null,
      phone: place.phone || null,
      website: place.site || null,
      email: place.email_1 || null,
      rating: place.rating ?? null,
      reviews_count: place.reviews ?? null,
      location: {
        lat: place.latitude ?? null,
        lng: place.longitude ?? null
      },
      photo_count: place.photo_count ?? null,
      working_hours: place.working_hours || null,
      business_status: place.business_status || null,
      facebook: place.facebook || null,
      instagram: place.instagram || null,
      reviews_data: place.reviews_data || []
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/discoveryService.test.js
```
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/discoveryService.js tests/discoveryService.test.js
git commit -m "feat: rewrite discovery service to use Outscraper API"
```

---

## Chunk 3: Filtering Service (Expanded)

### Task 7: Rewrite filtering service with chain detection, dedup, and closed status

**Files:**
- Modify: `src/services/filteringService.js`
- Create: `tests/filteringService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/filteringService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import FilteringService from '../src/services/filteringService.js';

const SETTINGS = {
  search: { radius_km: 50 },
  filters: { require_contact: true }
};
const OFFICE = { lat: 49.2026, lng: -122.9106 };

function makeLead(overrides = {}) {
  return {
    place_id: 'place_1',
    business_name: 'Test Biz',
    phone: '+16045551234',
    email: 'test@biz.ca',
    website: 'https://biz.ca',
    location: { lat: 49.23, lng: -122.88 },
    business_status: 'OPERATIONAL',
    ...overrides
  };
}

test('passes a valid lead', () => {
  const service = new FilteringService({ settings: SETTINGS });
  const { passed } = service.filterLeads([makeLead()], OFFICE, {});
  assert.equal(passed.length, 1);
});

test('excludes already-seen leads', () => {
  const seen = { 'place_1': { name: 'Test', first_seen: '2026-01-01', status: 'scored' } };
  const service = new FilteringService({ settings: SETTINGS });
  const { excluded } = service.filterLeads([makeLead()], OFFICE, seen);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].exclusion_reason, 'already_seen');
});

test('excludes leads outside radius', () => {
  const service = new FilteringService({ settings: SETTINGS });
  const lead = makeLead({ location: { lat: 50.5, lng: -120.0 } });
  const { excluded } = service.filterLeads([lead], OFFICE, {});
  assert.equal(excluded[0].exclusion_reason, 'outside_radius');
});

test('excludes leads with no contact info', () => {
  const service = new FilteringService({ settings: SETTINGS });
  const lead = makeLead({ phone: null, email: null, website: null });
  const { excluded } = service.filterLeads([lead], OFFICE, {});
  assert.equal(excluded[0].exclusion_reason, 'no_contact_info');
});

test('excludes chain/franchise businesses', () => {
  const service = new FilteringService({ settings: SETTINGS });
  const lead = makeLead({ business_name: 'Starbucks Reserve' });
  const { excluded } = service.filterLeads([lead], OFFICE, {});
  assert.equal(excluded[0].exclusion_reason, 'chain_franchise');
});

test('excludes permanently closed businesses', () => {
  const service = new FilteringService({ settings: SETTINGS });
  const lead = makeLead({ business_status: 'CLOSED_PERMANENTLY' });
  const { excluded } = service.filterLeads([lead], OFFICE, {});
  assert.equal(excluded[0].exclusion_reason, 'permanently_closed');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/filteringService.test.js
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
// src/services/filteringService.js
import { calculateDistance } from '../utils/geo.js';
import { isChain } from '../config/chains.js';
import { hasBeenSeen } from '../utils/seenLeads.js';

export default class FilteringService {
  constructor({ settings, logger } = {}) {
    this.settings = settings;
    this.logger = logger;
  }

  filterLeads(leads, officeLocation, seenLeads) {
    const passed = [];
    const excluded = [];

    for (const lead of leads) {
      const reason = this.getExclusionReason(lead, officeLocation, seenLeads);
      if (reason) {
        excluded.push({ ...lead, exclusion_reason: reason });
      } else {
        passed.push(lead);
      }
    }

    this.logger?.info(`Filtering complete: ${passed.length} passed, ${excluded.length} excluded.`);
    return { passed, excluded };
  }

  getExclusionReason(lead, officeLocation, seenLeads) {
    if (hasBeenSeen(seenLeads, lead.place_id)) {
      return 'already_seen';
    }

    if (lead.business_status === 'CLOSED_PERMANENTLY') {
      return 'permanently_closed';
    }

    if (isChain(lead.business_name)) {
      return 'chain_franchise';
    }

    if (!lead.location || lead.location.lat === null) {
      return 'missing_location';
    }

    const distance = calculateDistance(officeLocation, lead.location);
    if (distance > this.settings.search.radius_km) {
      return 'outside_radius';
    }

    if (this.settings.filters.require_contact) {
      if (!lead.phone && !lead.email && !lead.website) {
        return 'no_contact_info';
      }
    }

    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/filteringService.test.js
```
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/filteringService.js tests/filteringService.test.js
git commit -m "feat: rewrite filtering with chain detection, dedup, closed status"
```

---

## Chunk 4: Scoring Service (Claude Haiku)

### Task 8: Create scoring service

**Files:**
- Create: `src/services/scoringService.js`
- Create: `tests/scoringService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/scoringService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import ScoringService from '../src/services/scoringService.js';

function createMockAnthropicClient(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }]
      })
    }
  };
}

const SAMPLE_LEAD = {
  place_id: 'place_1',
  business_name: 'Joe\'s Bistro',
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  rating: 4.2,
  reviews_count: 85,
  photo_count: 24,
  working_hours: 'Monday: 11 AM-10 PM',
  location: { lat: 49.23, lng: -122.88 },
  website: 'https://joesbistro.ca',
  email: 'info@joesbistro.ca',
  instagram: 'https://instagram.com/joesbistro',
  facebook: null,
  reviews_data: [
    { review_text: 'Great food but floors were sticky', review_rating: 3 }
  ]
};

const SCORE_RESPONSE = JSON.stringify({
  total_score: 82,
  factor_scores: {
    size: 16,
    cleanliness_pain: 18,
    location: 13,
    online_presence: 13,
    business_age: 12,
    no_current_cleaner: 10
  },
  reasoning: 'Strong cleanliness pain signals in reviews. Close to office.'
});

test('scoreLeads returns scored leads sorted by total_score descending', async () => {
  const client = createMockAnthropicClient(SCORE_RESPONSE);
  const service = new ScoringService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const office = { lat: 49.2026, lng: -122.9106 };
  const results = await service.scoreLeads([SAMPLE_LEAD], office);

  assert.equal(results.length, 1);
  assert.equal(results[0].total_score, 82);
  assert.equal(results[0].reasoning, 'Strong cleanliness pain signals in reviews. Close to office.');
  assert.ok(results[0].factor_scores);
});

test('scoreLeads handles JSON parse errors gracefully', async () => {
  const client = createMockAnthropicClient('not valid json');
  const service = new ScoringService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const results = await service.scoreLeads([SAMPLE_LEAD], { lat: 49.2, lng: -122.9 });

  assert.equal(results.length, 1);
  assert.equal(results[0].total_score, 0);
  assert.ok(results[0].reasoning.includes('Scoring failed'));
});

test('selectTopN returns top N leads', async () => {
  const client = createMockAnthropicClient(SCORE_RESPONSE);
  const service = new ScoringService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const leads = [
    { ...SAMPLE_LEAD, place_id: 'a', total_score: 90 },
    { ...SAMPLE_LEAD, place_id: 'b', total_score: 70 },
    { ...SAMPLE_LEAD, place_id: 'c', total_score: 85 },
  ];

  const top = service.selectTopN(leads, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].place_id, 'a');
  assert.equal(top[1].place_id, 'c');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/scoringService.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```javascript
// src/services/scoringService.js
import Anthropic from '@anthropic-ai/sdk';
import { calculateDistance } from '../utils/geo.js';

export default class ScoringService {
  constructor({ apiKey, model, logger, client } = {}) {
    this.model = model || 'claude-haiku-4-5-20251001';
    this.logger = logger;
    this.client = client || new Anthropic({ apiKey });
  }

  async scoreLeads(leads, officeLocation) {
    const scored = [];

    for (const lead of leads) {
      const distance = calculateDistance(officeLocation, lead.location);
      const score = await this.scoreSingleLead(lead, distance);
      scored.push({ ...lead, ...score, distance_km: Math.round(distance * 10) / 10 });
    }

    scored.sort((a, b) => b.total_score - a.total_score);
    return scored;
  }

  async scoreSingleLead(lead, distanceKm) {
    const prompt = this.buildScoringPrompt(lead, distanceKm);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text;
      const parsed = JSON.parse(text);

      return {
        total_score: parsed.total_score,
        factor_scores: parsed.factor_scores,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      this.logger?.warn(`Scoring failed for ${lead.business_name}: ${error.message}`);
      return {
        total_score: 0,
        factor_scores: {},
        reasoning: `Scoring failed: ${error.message}`
      };
    }
  }

  buildScoringPrompt(lead, distanceKm) {
    const reviewTexts = (lead.reviews_data || [])
      .slice(0, 10)
      .map(r => `- (${r.review_rating}/5) ${r.review_text}`)
      .join('\n');

    return `You are a lead scoring assistant for a commercial cleaning company in Metro Vancouver.

Score this business as a potential cleaning service client on a 0-100 scale.

BUSINESS DATA:
- Name: ${lead.business_name}
- Type: ${lead.type || 'Unknown'}
- Address: ${lead.formatted_address || 'Unknown'}
- Distance from our office: ${distanceKm.toFixed(1)} km
- Rating: ${lead.rating ?? 'N/A'} (${lead.reviews_count ?? 0} reviews)
- Photos: ${lead.photo_count ?? 0}
- Hours: ${lead.working_hours || 'Unknown'}
- Website: ${lead.website || 'None'}
- Email: ${lead.email || 'None'}
- Instagram: ${lead.instagram || 'None'}
- Facebook: ${lead.facebook || 'None'}

RECENT REVIEWS:
${reviewTexts || 'No reviews available'}

SCORING FACTORS (weights):
1. Size signals (20%): More reviews, photos, longer hours = larger facility
2. Cleanliness pain (20%): Reviews mentioning dirty, messy, sticky, smell, washroom issues
3. Location (15%): Closer to New Westminster = higher score (max 50km)
4. Online presence (15%): Has website, email, social = more reachable and established
5. Business age (15%): Newer businesses (1-3 years) may need help setting up operations
6. No current cleaner (15%): No mentions of cleaning service = likely opportunity

Respond with ONLY this JSON (no markdown, no explanation):
{"total_score": <0-100>, "factor_scores": {"size": <0-20>, "cleanliness_pain": <0-20>, "location": <0-15>, "online_presence": <0-15>, "business_age": <0-15>, "no_current_cleaner": <0-15>}, "reasoning": "<1-2 sentences>"}`;
  }

  selectTopN(leads, n) {
    return [...leads].sort((a, b) => b.total_score - a.total_score).slice(0, n);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/scoringService.test.js
```
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/scoringService.js tests/scoringService.test.js
git commit -m "feat: add Claude Haiku scoring service"
```

---

## Chunk 5: Drafting Service (Claude Haiku)

### Task 9: Create outreach drafting service

**Files:**
- Create: `src/services/draftingService.js`
- Create: `tests/draftingService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/draftingService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  curious_neighbor: {
    email_subject: 'Quick question about your space',
    email_body: 'Hi Joe, I was walking by your bistro...',
    dm: 'Hey Joe\'s Bistro! Love the space...'
  },
  value_lead: {
    email_subject: 'Tip for restaurant operators',
    email_body: 'Hi there, I work with commercial...',
    dm: 'Hey! Quick tip for busy restaurants...'
  },
  compliment_question: {
    email_subject: 'Impressed by Joe\'s Bistro',
    email_body: 'Hi, I noticed your great reviews...',
    dm: 'Your reviews are amazing! Quick question...'
  }
});

function createMockClient(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }]
      })
    }
  };
}

const SAMPLE_LEAD = {
  business_name: 'Joe\'s Bistro',
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  rating: 4.2,
  reviews_count: 85,
  reviews_data: [
    { review_text: 'Great food, cozy space', review_rating: 5 }
  ],
  reasoning: 'Strong cleanliness signals'
};

test('draftOutreach returns 3 styles with email and DM for each', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  assert.ok(drafts.curious_neighbor);
  assert.ok(drafts.value_lead);
  assert.ok(drafts.compliment_question);
  assert.ok(drafts.curious_neighbor.email_subject);
  assert.ok(drafts.curious_neighbor.email_body);
  assert.ok(drafts.curious_neighbor.dm);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = {
    messages: { create: async () => { throw new Error('API down'); } }
  };
  const service = new DraftingService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  assert.ok(drafts.error);
});

test('draftAllLeads returns drafts for each lead', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client });

  const results = await service.draftAllLeads([SAMPLE_LEAD, SAMPLE_LEAD]);

  assert.equal(results.length, 2);
  assert.ok(results[0].curious_neighbor);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/draftingService.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```javascript
// src/services/draftingService.js
import Anthropic from '@anthropic-ai/sdk';

export default class DraftingService {
  constructor({ apiKey, model, logger, client } = {}) {
    this.model = model || 'claude-haiku-4-5-20251001';
    this.logger = logger;
    this.client = client || new Anthropic({ apiKey });
  }

  async draftAllLeads(leads) {
    const results = [];
    for (const lead of leads) {
      const drafts = await this.draftOutreach(lead);
      results.push(drafts);
    }
    return results;
  }

  async draftOutreach(lead) {
    const prompt = this.buildDraftingPrompt(lead);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text;
      return JSON.parse(text);
    } catch (error) {
      this.logger?.warn(`Drafting failed for ${lead.business_name}: ${error.message}`);
      return { error: `Drafting failed: ${error.message}` };
    }
  }

  buildDraftingPrompt(lead) {
    const reviewSnippets = (lead.reviews_data || [])
      .slice(0, 5)
      .map(r => `- "${r.review_text}"`)
      .join('\n');

    return `You are writing cold outreach messages for someone who works with commercial facilities on cleaning services in Metro Vancouver.

CRITICAL RULES:
- Do NOT mention any company name
- Do NOT pitch any service
- The ONLY goal is to start a conversation
- Be genuine and specific to this business
- Keep emails under 80 words
- Keep DMs under 40 words

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'Commercial facility'}
- Address: ${lead.formatted_address || 'Metro Vancouver'}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

REVIEW SNIPPETS:
${reviewSnippets || 'No reviews available'}

SCORING INSIGHT: ${lead.reasoning || 'No scoring data'}

Write 3 styles of outreach. For each, write an email (subject + body) and a short DM.

STYLE 1 - Curious Neighbor: Casual, ask how they handle cleaning. Reference being in their area.
STYLE 2 - Value Lead: Share a quick cleaning tip relevant to their business type, then ask a question.
STYLE 3 - Compliment + Question: Compliment something specific, then ask about their cleaning setup.

Respond with ONLY this JSON (no markdown):
{"curious_neighbor": {"email_subject": "...", "email_body": "...", "dm": "..."}, "value_lead": {"email_subject": "...", "email_body": "...", "dm": "..."}, "compliment_question": {"email_subject": "...", "email_body": "...", "dm": "..."}}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/draftingService.test.js
```
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/draftingService.js tests/draftingService.test.js
git commit -m "feat: add outreach drafting service with 3 message styles"
```

---

## Chunk 6: Google Sheets Export Service

### Task 10: Create Google Sheets export service

**Files:**
- Create: `src/services/sheetsService.js`
- Create: `tests/sheetsService.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sheetsService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import SheetsService from '../src/services/sheetsService.js';

function createMockSheets() {
  const appended = [];
  return {
    spreadsheets: {
      values: {
        append: async (params) => {
          appended.push(params);
          return { data: { updates: { updatedRows: params.requestBody.values.length } } };
        }
      }
    },
    _appended: appended
  };
}

const SAMPLE_LEAD = {
  business_name: 'Joe\'s Bistro',
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  distance_km: 8.2,
  phone: '+16045551234',
  email: 'info@joesbistro.ca',
  website: 'https://joesbistro.ca',
  instagram: 'https://instagram.com/joesbistro',
  facebook: null,
  total_score: 87,
  reasoning: 'Strong signals'
};

const SAMPLE_DRAFTS = {
  curious_neighbor: { email_subject: 'Hi', email_body: 'Hey...', dm: 'Hey!' },
  value_lead: { email_subject: 'Tip', email_body: 'Quick tip...', dm: 'Tip!' },
  compliment_question: { email_subject: 'Wow', email_body: 'Love it...', dm: 'Wow!' }
};

test('buildWeeklyLeadsRow formats lead data correctly', () => {
  const service = new SheetsService({ spreadsheetId: 'test' });
  const row = service.buildWeeklyLeadsRow(SAMPLE_LEAD, 1, 4, '2026-W11');

  assert.equal(row[0], '2026-W11');
  assert.equal(row[1], '1 of 4');
  assert.equal(row[2], 'Joe\'s Bistro');
});

test('buildDraftsRow formats drafts correctly', () => {
  const service = new SheetsService({ spreadsheetId: 'test' });
  const row = service.buildDraftsRow('Joe\'s Bistro', SAMPLE_DRAFTS);

  assert.equal(row[0], 'Joe\'s Bistro');
  assert.equal(row.length, 7); // name + 6 drafts
});

test('buildHistoryRow formats history entry correctly', () => {
  const service = new SheetsService({ spreadsheetId: 'test' });
  const row = service.buildHistoryRow(SAMPLE_LEAD);

  assert.equal(row[0], 'Joe\'s Bistro');
  assert.equal(row[2], 87);
  assert.equal(row[3], 'pending');
});

test('exportResults calls append for each tab', async () => {
  const mockSheets = createMockSheets();
  const service = new SheetsService({ spreadsheetId: 'test', sheets: mockSheets });

  await service.exportResults(
    [SAMPLE_LEAD],
    [SAMPLE_DRAFTS],
    '2026-W11'
  );

  assert.equal(mockSheets._appended.length, 3); // 3 tabs
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/sheetsService.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```javascript
// src/services/sheetsService.js
import { google } from 'googleapis';

export default class SheetsService {
  constructor({ spreadsheetId, logger, sheets, auth } = {}) {
    this.spreadsheetId = spreadsheetId;
    this.logger = logger;

    if (sheets) {
      this.sheets = sheets;
    } else if (auth) {
      this.sheets = google.sheets({ version: 'v4', auth });
    }
  }

  async exportResults(leads, drafts, weekLabel) {
    // Tab 1: Weekly Leads
    const weeklyRows = leads.map((lead, i) =>
      this.buildWeeklyLeadsRow(lead, i + 1, leads.length, weekLabel)
    );
    await this.appendRows('Weekly Leads!A:N', weeklyRows);

    // Tab 2: Outreach Drafts
    const draftRows = leads.map((lead, i) =>
      this.buildDraftsRow(lead.business_name, drafts[i])
    );
    await this.appendRows('Outreach Drafts!A:G', draftRows);

    // Tab 3: History
    const historyRows = leads.map(lead => this.buildHistoryRow(lead));
    await this.appendRows('History!A:E', historyRows);

    this.logger?.info(`Exported ${leads.length} leads to Google Sheets.`);
  }

  buildWeeklyLeadsRow(lead, rank, total, weekLabel) {
    return [
      weekLabel,
      `${rank} of ${total}`,
      lead.business_name,
      lead.type || '',
      lead.formatted_address || '',
      lead.distance_km ?? '',
      lead.phone || '',
      lead.email || '',
      lead.website || '',
      lead.instagram || '',
      lead.facebook || '',
      lead.total_score ?? '',
      lead.reasoning || '',
      'pending'
    ];
  }

  buildDraftsRow(businessName, drafts) {
    if (drafts?.error) {
      return [businessName, 'Error', 'Error', 'Error', 'Error', 'Error', 'Error'];
    }
    return [
      businessName,
      `Subject: ${drafts.curious_neighbor.email_subject}\n\n${drafts.curious_neighbor.email_body}`,
      `Subject: ${drafts.value_lead.email_subject}\n\n${drafts.value_lead.email_body}`,
      `Subject: ${drafts.compliment_question.email_subject}\n\n${drafts.compliment_question.email_body}`,
      drafts.curious_neighbor.dm,
      drafts.value_lead.dm,
      drafts.compliment_question.dm
    ];
  }

  buildHistoryRow(lead) {
    return [
      lead.business_name,
      new Date().toISOString().split('T')[0],
      lead.total_score ?? '',
      'pending',
      ''
    ];
  }

  async appendRows(range, rows) {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
  }

  async exportToCSV(leads, drafts, filePath) {
    const { default: fs } = await import('node:fs/promises');
    const lines = ['business_name,type,address,phone,email,website,score,reasoning'];

    for (const lead of leads) {
      const row = [
        lead.business_name, lead.type, lead.formatted_address,
        lead.phone, lead.email, lead.website,
        lead.total_score, lead.reasoning
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`);
      lines.push(row.join(','));
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return filePath;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/sheetsService.test.js
```
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sheetsService.js tests/sheetsService.test.js
git commit -m "feat: add Google Sheets export service with CSV fallback"
```

---

## Chunk 7: Orchestrator (CLI Entry Point)

### Task 11: Rewrite run.js to orchestrate the full pipeline

**Files:**
- Modify: `src/cli/run.js`

- [ ] **Step 1: Rewrite run.js**

```javascript
// src/cli/run.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import logger from '../utils/logger.js';
import { getCategoriesForWeek } from '../config/categories.js';
import { loadSeenLeads, saveSeenLeads, markAsSeen } from '../utils/seenLeads.js';
import DiscoveryService from '../services/discoveryService.js';
import FilteringService from '../services/filteringService.js';
import ScoringService from '../services/scoringService.js';
import DraftingService from '../services/draftingService.js';
import SheetsService from '../services/sheetsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSettings() {
  const settingsPath = path.resolve(__dirname, '../config/settings.json');
  const raw = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(raw);
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  const oneWeek = 604800000;
  return Math.ceil(diff / oneWeek);
}

function getWeekLabel() {
  const now = new Date();
  const week = getWeekNumber();
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function createSheetsAuth() {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsPath) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth;
}

async function run() {
  dotenv.config();
  const settings = await loadSettings();

  logger.info('=== Gleam Lead Scraper - Weekly Run ===');

  if (settings.operational.dry_run) {
    logger.info('Dry run enabled. Exiting.');
    return;
  }

  // Resolve paths
  const dataDir = path.resolve(__dirname, '../../data');
  await fs.mkdir(dataDir, { recursive: true });
  const seenLeadsPath = path.resolve(dataDir, 'seen_leads.json');

  // Load seen leads
  const seenLeads = await loadSeenLeads(seenLeadsPath);
  logger.info(`Loaded ${Object.keys(seenLeads).length} previously seen leads.`);

  // Phase 1: Discovery
  const weekNum = getWeekNumber();
  const categories = getCategoriesForWeek(weekNum);
  logger.info(`Week ${getWeekLabel()} — Categories: ${categories.join(', ')}`);

  const discovery = new DiscoveryService({
    apiKey: process.env.OUTSCRAPER_API_KEY,
    logger
  });

  const rawLeads = await discovery.discoverLeads({
    categories,
    location: 'New Westminster, BC',
    limit: settings.search.limit_per_category,
    language: settings.search.language,
    region: settings.search.region
  });
  logger.info(`Discovered ${rawLeads.length} raw leads.`);

  // Phase 2: Filtering
  const officeLocation = settings.office_location;
  const filtering = new FilteringService({ settings, logger });
  const { passed, excluded } = filtering.filterLeads(rawLeads, officeLocation, seenLeads);
  logger.info(`Filtered: ${passed.length} passed, ${excluded.length} excluded.`);

  if (passed.length === 0) {
    logger.warn('No leads passed filtering. Exiting.');
    return;
  }

  // Phase 3: Scoring
  const scoring = new ScoringService({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: settings.scoring.model,
    logger
  });
  const scoredLeads = await scoring.scoreLeads(passed, officeLocation);
  const topLeads = scoring.selectTopN(scoredLeads, settings.scoring.top_n);
  logger.info(`Scored ${scoredLeads.length} leads. Selected top ${topLeads.length}.`);

  // Phase 4: Drafting
  const drafting = new DraftingService({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: settings.drafting.model,
    logger
  });
  const drafts = await drafting.draftAllLeads(topLeads);
  logger.info(`Drafted outreach for ${drafts.length} leads.`);

  // Phase 5: Export
  const weekLabel = getWeekLabel();
  const sheetsId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  try {
    const auth = await createSheetsAuth();
    if (auth && sheetsId) {
      const sheetsService = new SheetsService({
        spreadsheetId: sheetsId,
        auth,
        logger
      });
      await sheetsService.exportResults(topLeads, drafts, weekLabel);
      logger.info('Exported to Google Sheets.');
    } else {
      throw new Error('Google Sheets not configured');
    }
  } catch (error) {
    logger.warn(`Sheets export failed: ${error.message}. Falling back to CSV.`);
    const csvPath = path.resolve(dataDir, `leads-${weekLabel}.csv`);
    const sheetsService = new SheetsService({ logger });
    await sheetsService.exportToCSV(topLeads, drafts, csvPath);
    logger.info(`Saved fallback CSV to ${csvPath}`);
  }

  // Update seen leads
  for (const lead of topLeads) {
    markAsSeen(seenLeads, lead.place_id, lead.business_name);
  }
  await saveSeenLeads(seenLeadsPath, seenLeads);
  logger.info(`Updated seen leads file (${Object.keys(seenLeads).length} total).`);

  logger.info('=== Run complete ===');
}

run().catch((error) => {
  logger.error(`Run failed: ${error.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/run.js
git commit -m "feat: rewrite orchestrator for full 5-phase pipeline"
```

---

### Task 12: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```bash
# Outscraper API (https://outscraper.com)
OUTSCRAPER_API_KEY=your_outscraper_api_key

# Anthropic Claude API (https://console.anthropic.com)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Google Sheets (service account JSON key file path)
GOOGLE_SHEETS_CREDENTIALS=./credentials/google-service-account.json
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id

# Optional overrides
# LOG_LEVEL=debug
# DRY_RUN=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example with required API keys"
```

---

## Chunk 8: Integration Test and Scheduler

### Task 13: Create integration test (dry-run end-to-end)

**Files:**
- Create: `tests/integration.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import DiscoveryService from '../src/services/discoveryService.js';
import FilteringService from '../src/services/filteringService.js';
import ScoringService from '../src/services/scoringService.js';
import DraftingService from '../src/services/draftingService.js';
import SheetsService from '../src/services/sheetsService.js';
import { getCategoriesForWeek } from '../src/config/categories.js';
import { loadSeenLeads, markAsSeen, hasBeenSeen } from '../src/utils/seenLeads.js';

// Mock data simulating Outscraper response
const MOCK_OUTSCRAPER_RESPONSE = [[
  {
    name: 'Fresh Bites Cafe', place_id: 'mock_1',
    full_address: '456 Columbia St, New Westminster, BC',
    phone: '+16045559876', site: 'https://freshbitescafe.ca',
    email_1: 'hello@freshbitescafe.ca', rating: 4.3, reviews: 62,
    type: 'Restaurant', latitude: 49.2010, longitude: -122.9120,
    photo_count: 15, working_hours: 'Mon-Fri 7AM-8PM',
    business_status: 'OPERATIONAL', instagram: 'https://instagram.com/freshbites',
    facebook: null,
    reviews_data: [{ review_text: 'Love the food, washrooms could be cleaner', review_rating: 4 }]
  },
  {
    name: 'Starbucks', place_id: 'mock_2',
    full_address: '789 Main St, Vancouver, BC',
    phone: '+16045551111', site: 'https://starbucks.ca',
    email_1: null, rating: 4.0, reviews: 200,
    type: 'Coffee shop', latitude: 49.2827, longitude: -123.1207,
    photo_count: 30, working_hours: 'Daily 5AM-9PM',
    business_status: 'OPERATIONAL', instagram: null, facebook: null,
    reviews_data: []
  }
]];

const MOCK_SCORE_RESPONSE = JSON.stringify({
  total_score: 78,
  factor_scores: { size: 14, cleanliness_pain: 16, location: 14, online_presence: 12, business_age: 12, no_current_cleaner: 10 },
  reasoning: 'Washroom complaints in reviews, close to office'
});

const MOCK_DRAFT_RESPONSE = JSON.stringify({
  curious_neighbor: { email_subject: 'Hi', email_body: 'Hey there...', dm: 'Hey!' },
  value_lead: { email_subject: 'Tip', email_body: 'Quick tip...', dm: 'Tip!' },
  compliment_question: { email_subject: 'Love it', email_body: 'Great spot...', dm: 'Wow!' }
});

test('full pipeline: discover → filter → score → draft → export', async () => {
  // Step 1: Discovery (mocked)
  const discoveryClient = { googleMapsSearch: async () => MOCK_OUTSCRAPER_RESPONSE };
  const discovery = new DiscoveryService({ apiKey: 'test', client: discoveryClient });

  const categories = getCategoriesForWeek(1);
  const rawLeads = await discovery.discoverLeads({
    categories: [categories[0]],
    location: 'New Westminster, BC',
    limit: 50, language: 'en', region: 'CA'
  });

  assert.equal(rawLeads.length, 2);

  // Step 2: Filtering
  const settings = { search: { radius_km: 50 }, filters: { require_contact: true } };
  const filtering = new FilteringService({ settings });
  const office = { lat: 49.2026, lng: -122.9106 };
  const { passed, excluded } = filtering.filterLeads(rawLeads, office, {});

  // Starbucks should be excluded (chain)
  assert.equal(passed.length, 1);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].exclusion_reason, 'chain_franchise');
  assert.equal(passed[0].business_name, 'Fresh Bites Cafe');

  // Step 3: Scoring (mocked)
  const scoringClient = { messages: { create: async () => ({ content: [{ type: 'text', text: MOCK_SCORE_RESPONSE }] }) } };
  const scoring = new ScoringService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client: scoringClient });
  const scored = await scoring.scoreLeads(passed, office);
  const topLeads = scoring.selectTopN(scored, 4);

  assert.equal(topLeads.length, 1);
  assert.equal(topLeads[0].total_score, 78);

  // Step 4: Drafting (mocked)
  const draftingClient = { messages: { create: async () => ({ content: [{ type: 'text', text: MOCK_DRAFT_RESPONSE }] }) } };
  const drafting = new DraftingService({ apiKey: 'test', model: 'claude-haiku-4-5-20251001', client: draftingClient });
  const drafts = await drafting.draftAllLeads(topLeads);

  assert.equal(drafts.length, 1);
  assert.ok(drafts[0].curious_neighbor);

  // Step 5: Export (mocked sheets)
  const appended = [];
  const mockSheets = {
    spreadsheets: { values: { append: async (p) => { appended.push(p); return { data: { updates: { updatedRows: 1 } } }; } } }
  };
  const sheets = new SheetsService({ spreadsheetId: 'test', sheets: mockSheets });
  await sheets.exportResults(topLeads, drafts, '2026-W11');

  assert.equal(appended.length, 3); // 3 tabs

  // Step 6: Deduplication
  const seen = {};
  markAsSeen(seen, topLeads[0].place_id, topLeads[0].business_name);
  assert.equal(hasBeenSeen(seen, 'mock_1'), true);
  assert.equal(hasBeenSeen(seen, 'mock_2'), false);
});
```

- [ ] **Step 2: Run test**

```bash
node --test tests/integration.test.js
```
Expected: PASS

- [ ] **Step 3: Run all tests**

```bash
node --test tests/
```
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: add end-to-end integration test with mocked services"
```

---

### Task 14: Set up Windows Task Scheduler

**Files:** None (system configuration)

- [ ] **Step 1: Create a batch file for scheduling**

Create `run-weekly.bat` in project root:
```batch
@echo off
cd /d A:\Projects\gaban
node src/cli/run.js >> logs\run.log 2>&1
```

- [ ] **Step 2: Create logs directory**

```bash
mkdir -p logs
```

Add `logs/` to `.gitignore` (already done in Task 4).

- [ ] **Step 3: Set up Windows Task Scheduler**

Open Task Scheduler and create a new task:
- **Name:** Gleam Lead Scraper - Weekly Run
- **Trigger:** Weekly, Monday at 6:00 AM
- **Action:** Start a program
  - Program: `A:\Projects\gaban\run-weekly.bat`
  - Start in: `A:\Projects\gaban`
- **Conditions:** Uncheck "Start only if on AC power"
- **Settings:** Check "Run whether user is logged on or not"

- [ ] **Step 4: Commit batch file**

```bash
git add run-weekly.bat
git commit -m "chore: add batch file for Windows Task Scheduler"
```

---

### Task 15: Final verification and run

- [ ] **Step 1: Verify all tests pass**

```bash
node --test tests/
```
Expected: All tests PASS

- [ ] **Step 2: Create .env from .env.example and add real API keys**

```bash
cp .env.example .env
```
Then edit `.env` with actual keys.

- [ ] **Step 3: Do a real test run**

```bash
node src/cli/run.js
```
Expected: Full pipeline runs, results appear in Google Sheets (or CSV fallback)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete lead generation pipeline v1"
```
