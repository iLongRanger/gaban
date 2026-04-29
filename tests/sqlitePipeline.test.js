import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import SqliteService from '../src/services/sqliteService.js';

describe('Pipeline to SQLite integration', () => {
  it('exports scored leads and drafts to SQLite', () => {
    const db = initDb(':memory:');
    const service = new SqliteService({ db });

    const leads = [
      {
        place_id: 'p1', business_name: 'Biz A', type: 'gym',
        formatted_address: '1 St', location: { lat: 49.2, lng: -122.9 },
        distance_km: 5, total_score: 90, factor_scores: { size: 18 },
        reasoning: 'great lead'
      },
      {
        place_id: 'p2', business_name: 'Biz B', type: 'office',
        formatted_address: '2 St', location: { lat: 49.3, lng: -122.8 },
        distance_km: 10, total_score: 70, factor_scores: { size: 12 },
        reasoning: 'ok lead'
      }
    ];

    const drafts = [
      {
        curious_neighbor: { email_subject: 's1', email_body: 'b1', dm: 'd1' },
        value_lead: { email_subject: 's2', email_body: 'b2', dm: 'd2' },
        compliment_question: { email_subject: 's3', email_body: 'b3', dm: 'd3' }
      },
      {
        curious_neighbor: { email_subject: 's4', email_body: 'b4', dm: 'd4' },
        value_lead: { email_subject: 's5', email_body: 'b5', dm: 'd5' },
        compliment_question: { email_subject: 's6', email_body: 'b6', dm: 'd6' }
      }
    ];

    service.exportResults(leads, drafts, '2026-W11');

    const allLeads = db.prepare('SELECT * FROM leads ORDER BY total_score DESC').all();
    assert.equal(allLeads.length, 2);
    assert.equal(allLeads[0].business_name, 'Biz A');

    const allDrafts = db.prepare('SELECT * FROM outreach_drafts').all();
    assert.equal(allDrafts.length, 6);

    db.close();
  });
});
