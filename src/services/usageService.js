const OPENAI_RATES = {
  'gpt-5.4-mini': { inputPerMillion: 0.75, outputPerMillion: 4.5 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 }
};

const OUTSCRAPER_FREE_RECORDS = 500;
const OUTSCRAPER_RECORD_PRICE_PER_1000 = 3;

export class UsageService {
  /**
   * @param {{ db: any, now?: () => Date }} options
   */
  constructor({ db, now = () => new Date() } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.now = now;
  }

  record(event) {
    const occurredAt = event.occurredAt || this.now().toISOString();
    const units = Number.isFinite(Number(event.units)) ? Number(event.units) : 1;
    const inputTokens = Number.parseInt(event.inputTokens || 0, 10) || 0;
    const outputTokens = Number.parseInt(event.outputTokens || 0, 10) || 0;
    const estimatedCost = event.estimatedCostUsd ?? estimateEventCost({
      provider: event.provider,
      model: event.model,
      inputTokens,
      outputTokens
    });

    this.db.prepare(
      `INSERT INTO api_usage_events
        (provider, service, operation, model, units, unit_name, input_tokens, output_tokens, estimated_cost_usd, metadata, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.provider,
      event.service,
      event.operation,
      event.model || null,
      units,
      event.unitName || 'request',
      inputTokens,
      outputTokens,
      estimatedCost,
      event.metadata ? JSON.stringify(event.metadata) : null,
      occurredAt
    );
  }

  safeRecord(event) {
    try {
      this.record(event);
    } catch {
      // Usage logging must never block outreach.
    }
  }

  monthlySummary({ at = this.now() } = {}) {
    const range = monthRange(at);
    const events = this.db.prepare(
      `SELECT provider, service, operation, model,
              SUM(units) AS units,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(COALESCE(estimated_cost_usd, 0)) AS event_cost_usd,
              COUNT(*) AS calls
       FROM api_usage_events
       WHERE occurred_at >= ? AND occurred_at < ?
       GROUP BY provider, service, operation, model
       ORDER BY provider, service, operation, model`
    ).all(range.start, range.end);

    const recentEvents = this.db.prepare(
      `SELECT provider, service, operation, model, units, unit_name, input_tokens, output_tokens, estimated_cost_usd, occurred_at
       FROM api_usage_events
       ORDER BY occurred_at DESC, id DESC
       LIMIT 12`
    ).all();

    const gmailSent = this.db.prepare(
      `SELECT COUNT(*) AS count
       FROM email_sends
       WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?`
    ).get(range.start, range.end)?.count || 0;

    const openAi = summarizeOpenAi(events);
    const outscraper = summarizeOutscraper(events);
    const gmail = {
      provider: 'Gmail',
      service: 'Gmail API',
      usageLabel: `${gmailSent} sent emails`,
      estimatedCostUsd: 0,
      priceLabel: 'Gmail API $0 variable cost. Workspace Starter is CAD $11/user monthly, or CAD $9.20/user with annual commitment.',
      sourceUrl: 'https://workspace.google.com/intl/en_ca/business/',
      note: 'Email sending has no per-message API charge in this estimate. Your Workspace subscription is billed separately by Google.'
    };

    const cards = [outscraper, openAi, gmail];
    const totalEstimatedCostUsd = cards.reduce((sum, card) => sum + card.estimatedCostUsd, 0);

    return {
      month: range.label,
      range,
      cards,
      rows: events.map((event) => ({
        ...event,
        units: Number(event.units || 0),
        input_tokens: Number(event.input_tokens || 0),
        output_tokens: Number(event.output_tokens || 0),
        calls: Number(event.calls || 0),
        estimated_cost_usd: costForGroupedEvent(event)
      })),
      recentEvents,
      totalEstimatedCostUsd
    };
  }
}

export function estimateEventCost({ provider, model, inputTokens = 0, outputTokens = 0 }) {
  if (provider !== 'openai') return null;
  const rate = rateForOpenAiModel(model);
  if (!rate) return null;
  return (inputTokens / 1_000_000) * rate.inputPerMillion +
    (outputTokens / 1_000_000) * rate.outputPerMillion;
}

function summarizeOpenAi(events) {
  const openAiEvents = events.filter((event) => event.provider === 'openai');
  const inputTokens = sum(openAiEvents, 'input_tokens');
  const outputTokens = sum(openAiEvents, 'output_tokens');
  const calls = sum(openAiEvents, 'calls');
  const estimatedCostUsd = openAiEvents.reduce((total, event) => total + costForGroupedEvent(event), 0);

  return {
    provider: 'OpenAI',
    service: 'Chat Completions',
    usageLabel: `${formatNumber(calls)} calls, ${formatNumber(inputTokens + outputTokens)} tokens`,
    estimatedCostUsd,
    priceLabel: 'Model token pricing, e.g. gpt-5-mini $0.25 input / $2 output per 1M tokens',
    sourceUrl: 'https://openai.com/api/pricing',
    note: inputTokens + outputTokens === 0
      ? 'Token totals start after this usage tracker is installed.'
      : `${formatNumber(inputTokens)} input tokens, ${formatNumber(outputTokens)} output tokens.`
  };
}

function summarizeOutscraper(events) {
  const outscraperEvents = events.filter((event) => event.provider === 'outscraper');
  const records = sum(outscraperEvents, 'units');
  const billableRecords = Math.max(0, records - OUTSCRAPER_FREE_RECORDS);
  const estimatedCostUsd = (billableRecords / 1000) * OUTSCRAPER_RECORD_PRICE_PER_1000;

  return {
    provider: 'Outscraper',
    service: 'Google Maps Scraper',
    usageLabel: `${formatNumber(records)} places returned`,
    estimatedCostUsd,
    priceLabel: `First ${OUTSCRAPER_FREE_RECORDS} places/month free, then $${OUTSCRAPER_RECORD_PRICE_PER_1000}/1,000`,
    sourceUrl: 'https://outscraper.com/pricing/',
    note: billableRecords === 0
      ? `${formatNumber(OUTSCRAPER_FREE_RECORDS - records)} free records left in the local estimate.`
      : `${formatNumber(billableRecords)} estimated billable records this month.`
  };
}

function costForGroupedEvent(event) {
  if (event.provider === 'openai') {
    return estimateEventCost({
      provider: 'openai',
      model: event.model,
      inputTokens: Number(event.input_tokens || 0),
      outputTokens: Number(event.output_tokens || 0)
    }) || 0;
  }
  return Number(event.event_cost_usd || event.estimated_cost_usd || 0);
}

function rateForOpenAiModel(model = '') {
  const normalized = String(model || '').toLowerCase();
  const key = Object.keys(OPENAI_RATES)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => normalized === candidate || normalized.startsWith(candidate + '-'));
  return key ? OPENAI_RATES[key] : null;
}

function monthRange(at) {
  const date = at instanceof Date ? at : new Date(at);
  const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-CA').format(Math.round(Number(value || 0)));
}
