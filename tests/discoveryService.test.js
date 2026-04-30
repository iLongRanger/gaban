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
    googleMapsSearch: async (...args) => {
      calls.push(args);
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
  assert.ok(calls[0][0][0].includes('restaurants'));
  assert.ok(calls[1][0][0].includes('offices'));
  assert.equal(calls[0][7], false);
  assert.equal(calls[1][7], false);
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
