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
  touch_1_poke:  { email_subject: 'Poke',  email_body: 'Poke body...',  dm: 'Poke DM!'  },
  touch_1_route: { email_subject: 'Route', email_body: 'Route body...', dm: 'Route DM!' },
  touch_2:       { email_subject: 'Tip',   email_body: 'Quick tip...',  dm: 'Tip!'      },
  touch_3:       { email_subject: 'Give',  email_body: 'Give first...', dm: 'Give DM!'  },
  touch_4:       { email_subject: 'Bye',   email_body: 'Last chance...', dm: 'Bye DM!'  },
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
  assert.equal(row.length, 11); // name + 5 email cols + 5 dm cols
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
