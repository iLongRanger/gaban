import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';
import { UsageService, estimateEventCost } from '../src/services/usageService.js';
import OpenAiJsonClient from '../src/services/openAiJsonClient.js';

describe('UsageService', () => {
  let db;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('records usage events and summarizes monthly estimated costs', () => {
    const usage = new UsageService({ db, now: () => new Date('2026-05-10T12:00:00.000Z') });

    usage.record({
      provider: 'outscraper',
      service: 'google_maps_scraper',
      operation: 'google_maps_search',
      units: 750,
      unitName: 'place'
    });
    usage.record({
      provider: 'openai',
      service: 'chat_completions',
      operation: 'lead_scoring',
      model: 'gpt-5-mini',
      inputTokens: 1_000_000,
      outputTokens: 500_000
    });

    const summary = usage.monthlySummary({ at: new Date('2026-05-15T00:00:00.000Z') });

    assert.equal(summary.month, '2026-05');
    assert.equal(summary.rows.length, 2);
    assert.equal(summary.cards.find(card => card.provider === 'Outscraper').estimatedCostUsd, 0.75);
    assert.equal(summary.cards.find(card => card.provider === 'OpenAI').estimatedCostUsd, 1.25);
    assert.equal(summary.totalEstimatedCostUsd, 2);
  });

  it('estimates OpenAI event cost by model', () => {
    assert.equal(estimateEventCost({
      provider: 'openai',
      model: 'gpt-5-mini',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    }), 2.25);
  });
});

describe('OpenAiJsonClient usage recording', () => {
  it('records token usage from API responses', async () => {
    const events = [];
    const client = new OpenAiJsonClient({
      apiKey: 'test',
      usageRecorder: { safeRecord: event => events.push(event) },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      })
    });

    const result = await client.createJson({
      model: 'gpt-5-mini',
      maxTokens: 100,
      prompt: 'Return JSON',
      operation: 'lead_scoring'
    });

    assert.equal(result, '{"ok":true}');
    assert.equal(events.length, 1);
    assert.equal(events[0].provider, 'openai');
    assert.equal(events[0].inputTokens, 10);
    assert.equal(events[0].outputTokens, 5);
    assert.equal(events[0].operation, 'lead_scoring');
  });
});
