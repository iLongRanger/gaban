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
