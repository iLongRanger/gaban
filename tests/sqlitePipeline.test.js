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
        touch_1_poke:  { email_subject: 's1', email_body: 'b1', dm: 'd1' },
        touch_1_route: { email_subject: 's2', email_body: 'b2', dm: 'd2' },
        touch_2:       { email_subject: 's3', email_body: 'b3', dm: 'd3' },
        touch_3:       { email_subject: 's4', email_body: 'b4', dm: 'd4' },
        touch_4:       { email_subject: 's5', email_body: 'b5', dm: 'd5' }
      },
      {
        touch_1_poke:  { email_subject: 's6',  email_body: 'b6',  dm: 'd6'  },
        touch_1_route: { email_subject: 's7',  email_body: 'b7',  dm: 'd7'  },
        touch_2:       { email_subject: 's8',  email_body: 'b8',  dm: 'd8'  },
        touch_3:       { email_subject: 's9',  email_body: 'b9',  dm: 'd9'  },
        touch_4:       { email_subject: 's10', email_body: 'b10', dm: 'd10' }
      }
    ];

    service.exportResults(leads, drafts, '2026-W11');

    const allLeads = db.prepare('SELECT * FROM leads ORDER BY total_score DESC').all();
    assert.equal(allLeads.length, 2);
    assert.equal(allLeads[0].business_name, 'Biz A');

    const allDrafts = db.prepare('SELECT * FROM outreach_drafts').all();
    assert.equal(allDrafts.length, 10);

    db.close();
  });
});
