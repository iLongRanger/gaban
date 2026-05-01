import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { didAllScoringFail, mergeConfig, normalizeTopN, validateRequiredEnv } from '../src/cli/run.js';

describe('mergeConfig', () => {
  const base = {
    search: { location: 'New Westminster, BC', radius_km: 50, limit_per_category: 50, language: 'en', region: 'CA' },
    scoring: { model: 'gpt-5-mini', top_n: 4 },
    drafting: { model: 'gpt-5-mini' },
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
    assert.strictEqual(result.scoring.model, 'gpt-5-mini');
  });
});

describe('validateRequiredEnv', () => {
  it('throws when pipeline API keys are missing', () => {
    assert.throws(
      () => validateRequiredEnv({ OUTSCRAPER_API_KEY: 'outscraper-key' }),
      /OPENAI_API_KEY/
    );
  });

  it('allows configured pipeline API keys', () => {
    assert.doesNotThrow(() => validateRequiredEnv({
      OUTSCRAPER_API_KEY: 'outscraper-key',
      OPENAI_API_KEY: 'openai-key'
    }));
  });
});

describe('didAllScoringFail', () => {
  it('returns true when every scored lead is an AI failure fallback', () => {
    assert.strictEqual(didAllScoringFail([
      { total_score: 0, reasoning: 'Scoring failed: quota' },
      { total_score: 0, reasoning: 'Scoring failed: auth' }
    ]), true);
  });

  it('returns false when at least one scored lead succeeded', () => {
    assert.strictEqual(didAllScoringFail([
      { total_score: 0, reasoning: 'Scoring failed: quota' },
      { total_score: 72, reasoning: 'Good fit' }
    ]), false);
  });
});

describe('normalizeTopN', () => {
  it('enforces a minimum of 10 leads', () => {
    assert.strictEqual(normalizeTopN(5), 10);
    assert.strictEqual(normalizeTopN(10), 10);
    assert.strictEqual(normalizeTopN(12), 12);
    assert.strictEqual(normalizeTopN(undefined), 10);
  });
});
