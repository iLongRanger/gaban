// tests/integration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import DiscoveryService from '../src/services/discoveryService.js';
import FilteringService from '../src/services/filteringService.js';
import ScoringService from '../src/services/scoringService.js';
import DraftingService from '../src/services/draftingService.js';
import SheetsService from '../src/services/sheetsService.js';
import { getCategoriesForWeek } from '../src/config/categories.js';
import { markAsSeen, hasBeenSeen } from '../src/utils/seenLeads.js';

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
