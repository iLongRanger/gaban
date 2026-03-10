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
