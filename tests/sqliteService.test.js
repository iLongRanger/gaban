import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import SqliteService from '../src/services/sqliteService.js';

describe('SqliteService', () => {
  let db;
  let service;

  const sampleLead = {
    place_id: 'ChIJ_test_123',
    business_name: 'Test Restaurant',
    type: 'restaurant',
    subtypes: ['restaurant', 'food'],
    formatted_address: '123 Main St, Vancouver, BC',
    phone: '604-555-1234',
    website: 'https://test.com',
    email: 'info@test.com',
    rating: 4.2,
    reviews_count: 85,
    photo_count: 12,
    location: { lat: 49.2827, lng: -123.1207 },
    distance_km: 12.3,
    working_hours: 'Mon-Fri 9-5',
    business_status: 'OPERATIONAL',
    instagram: 'https://instagram.com/test',
    facebook: 'https://facebook.com/test',
    reviews_data: [
      { review_text: 'Great food but dirty floors', review_rating: 3 },
      { review_text: 'Love this place', review_rating: 5 }
    ],
    total_score: 82,
    factor_scores: { size: 16, cleanliness_pain: 18, location: 12, online_presence: 14, business_age: 10, no_current_cleaner: 12 },
    reasoning: 'High cleanliness pain signals, good proximity'
  };

  const sampleDrafts = {
    curious_neighbor: {
      email_subject: 'Quick question about your space',
      email_body: 'Hey, I noticed your restaurant...',
      dm: 'Hey! Quick question about your spot...'
    },
    value_lead: {
      email_subject: 'Tip for restaurant floors',
      email_body: 'I was reading about floor care...',
      dm: 'Quick tip for your floors...'
    },
    compliment_question: {
      email_subject: 'Love your place',
      email_body: 'I walked by your restaurant...',
      dm: 'Your place looks great...'
    }
  };

  before(() => {
    db = initDb(':memory:');
    service = new SqliteService({ db, logger: null });
  });

  after(() => {
    db.close();
  });

  it('inserts a lead with mapped field names', () => {
    service.exportResults([sampleLead], [sampleDrafts], '2026-W11');

    const lead = db.prepare('SELECT * FROM leads WHERE place_id = ?').get('ChIJ_test_123');
    assert.equal(lead.business_name, 'Test Restaurant');
    assert.equal(lead.address, '123 Main St, Vancouver, BC');
    assert.equal(lead.latitude, 49.2827);
    assert.equal(lead.longitude, -123.1207);
    assert.equal(lead.total_score, 82);
    assert.equal(lead.status, 'new');
    assert.equal(lead.week, '2026-W11');
    assert.deepEqual(JSON.parse(lead.subtypes), ['restaurant', 'food']);
    assert.equal(JSON.parse(lead.reviews_data).length, 2);
  });

  it('inserts 3 outreach drafts per lead', () => {
    const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = 1').all();
    assert.equal(drafts.length, 3);
    const styles = drafts.map(d => d.style).sort();
    assert.deepEqual(styles, ['compliment_question', 'curious_neighbor', 'value_lead']);
  });

  it('skips duplicate leads on re-run (upsert)', () => {
    service.exportResults([sampleLead], [sampleDrafts], '2026-W11');
    const count = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
    assert.equal(count, 1);
  });

  it('handles drafting errors gracefully', () => {
    const errorLead = { ...sampleLead, place_id: 'ChIJ_error_456', business_name: 'Error Biz' };
    const errorDrafts = { error: 'Drafting failed: timeout' };
    service.exportResults([errorLead], [errorDrafts], '2026-W11');

    const lead = db.prepare('SELECT * FROM leads WHERE place_id = ?').get('ChIJ_error_456');
    assert.ok(lead);
    const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = ?').all(lead.id);
    assert.equal(drafts.length, 0);
  });
});
