import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../src/cli/run.js';

describe('mergeConfig', () => {
  const base = {
    search: { location: 'New Westminster, BC', radius_km: 50, limit_per_category: 50, language: 'en', region: 'CA' },
    scoring: { model: 'claude-haiku-4-5-20251001', top_n: 4 },
    drafting: { model: 'claude-haiku-4-5-20251001' },
    office_location: { lat: 49.2026, lng: -122.9106 },
    filters: { require_contact: true },
    operational: { dry_run: false }
  };

  it('returns base settings when no override provided', () => {
    const result = mergeConfig(base, null);
    assert.deepStrictEqual(result, base);
  });

  it('overrides nested search fields', () => {
    const override = { search: { location: 'Vancouver, BC', radius_km: 30 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.search.location, 'Vancouver, BC');
    assert.strictEqual(result.search.radius_km, 30);
    assert.strictEqual(result.search.limit_per_category, 50);
  });

  it('overrides office_location', () => {
    const override = { office_location: { lat: 49.3, lng: -123.0 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.office_location.lat, 49.3);
  });

  it('overrides scoring.top_n', () => {
    const override = { scoring: { top_n: 8 } };
    const result = mergeConfig(base, override);
    assert.strictEqual(result.scoring.top_n, 8);
    assert.strictEqual(result.scoring.model, 'claude-haiku-4-5-20251001');
  });
});
