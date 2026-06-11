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
    touch_1_poke: {
      email_subject: 'one thing for your kitchen',
      email_body: 'Hey, I work with restaurants nearby...',
      dm: 'Hey! Quick note about kitchen inspections...'
    },
    touch_1_route: {
      email_subject: 'cleaning route nearby',
      email_body: 'We already clean restaurants nearby...',
      dm: 'Quick note about our cleaning route...'
    },
    touch_2: {
      email_subject: 'follow up on the checklist',
      email_body: 'I sent a note last week...',
      dm: 'Following up on that checklist...'
    },
    touch_3: {
      email_subject: 'should I close the file?',
      email_body: 'I will stop reaching out...',
      dm: 'Closing the file on my end...'
    },
    touch_4: {
      email_subject: 'last note',
      email_body: 'One final thought before I go...',
      dm: 'Last message from me...'
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

  it('inserts 5 outreach drafts per lead', () => {
    const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = 1').all();
    assert.equal(drafts.length, 5);
    const styles = drafts.map(d => d.style).sort();
    assert.deepEqual(styles, ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']);
  });

  it('skips duplicate leads on re-run (upsert)', () => {
    service.exportResults([sampleLead], [sampleDrafts], '2026-W11');
    const count = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
    assert.equal(count, 1);
  });

  it('records leads in separate pipeline run result sets', () => {
    const now = new Date().toISOString();
    const run1 = db.prepare(
      "INSERT INTO pipeline_runs (status, started_at) VALUES ('running', ?)"
    ).run(now).lastInsertRowid;
    const run2 = db.prepare(
      "INSERT INTO pipeline_runs (status, started_at) VALUES ('running', ?)"
    ).run(now).lastInsertRowid;

    service.exportResults([sampleLead], [sampleDrafts], '2026-W11', { runId: run1 });
    service.exportResults([sampleLead], [sampleDrafts], '2026-W11', { runId: run2 });

    const rows = db.prepare(
      'SELECT run_id, rank FROM lead_run_results ORDER BY run_id'
    ).all();
    assert.deepEqual(rows.map(row => row.run_id), [run1, run2]);
    assert.deepEqual(rows.map(row => row.rank), [1, 1]);

    const runCounts = db.prepare(
      'SELECT id, leads_found FROM pipeline_runs WHERE id IN (?, ?) ORDER BY id'
    ).all(run1, run2);
    assert.deepEqual(runCounts.map(row => row.leads_found), [1, 1]);
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

  it('converts undefined lead and draft fields to nullable values', () => {
    const partialLead = {
      ...sampleLead,
      place_id: 'ChIJ_partial_789',
      business_name: 'Partial Biz',
      type: undefined,
      formatted_address: undefined,
      phone: undefined,
      website: undefined,
      email: undefined,
      subtypes: undefined,
      working_hours: undefined,
      business_status: undefined,
      instagram: undefined,
      facebook: undefined
    };
    const partialDrafts = {
      touch_1_poke: {
        email_subject: undefined,
        email_body: 'Body',
        dm: undefined
      }
    };

    service.exportResults([partialLead], [partialDrafts], '2026-W11');

    const lead = db.prepare('SELECT * FROM leads WHERE place_id = ?').get('ChIJ_partial_789');
    assert.equal(lead.type, null);
    assert.equal(lead.address, null);
    const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = ?').all(lead.id);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].email_subject, '');
    assert.equal(drafts[0].dm, '');
  });

  it('generates a stable fallback id when the provider omits place_id', () => {
    const missingPlaceIdLead = {
      ...sampleLead,
      place_id: undefined,
      business_name: 'Missing Place Id Cafe',
      formatted_address: '456 Columbia St, New Westminster, BC',
      phone: undefined,
      website: undefined
    };

    service.exportResults([missingPlaceIdLead], [sampleDrafts], '2026-W11');

    const lead = db.prepare(
      "SELECT * FROM leads WHERE business_name = 'Missing Place Id Cafe'"
    ).get();
    assert.ok(lead);
    assert.match(lead.place_id, /^generated:/);

    const drafts = db.prepare('SELECT * FROM outreach_drafts WHERE lead_id = ?').all(lead.id);
    assert.equal(drafts.length, 5);
  });

  it('persists all five draft styles for a lead', () => {
    const fiveDraft = {
      touch_1_poke:  { email_subject: 'overnight clean', email_body: 'a', dm: 'a' },
      touch_1_route: { email_subject: 'cleaning',        email_body: 'b', dm: 'b' },
      touch_2:       { email_subject: 'spots',           email_body: 'c', dm: 'c' },
      touch_3:       { email_subject: 'tip',             email_body: 'd', dm: 'd' },
      touch_4:       { email_subject: 'closing',         email_body: 'e', dm: 'e' },
    };
    const fiveLead = { ...sampleLead, place_id: 'ChIJ_five_styles_001', business_name: 'Five Styles Bistro' };

    service.exportResults([fiveLead], [fiveDraft], '2026-W11');

    const styles = db.prepare(
      `SELECT od.style FROM outreach_drafts od JOIN leads l ON l.id = od.lead_id WHERE l.place_id = ? ORDER BY od.style`
    ).all('ChIJ_five_styles_001').map((r) => r.style);
    assert.deepEqual(styles, ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']);
  });
});
