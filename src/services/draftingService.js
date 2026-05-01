import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';

export default class DraftingService {
  constructor({ apiKey, model, logger, client } = {}) {
    this.model = model || 'gpt-5-mini';
    this.logger = logger;
    this.client = client || new OpenAiJsonClient({ apiKey });
  }

  async draftAllLeads(leads) {
    const results = [];
    for (const lead of leads) {
      const drafts = await this.draftOutreach(lead);
      results.push(drafts);
    }
    return results;
  }

  async draftOutreach(lead) {
    const prompt = this.buildDraftingPrompt(lead);

    try {
      const text = await createJsonCompletion(this.client, {
        model: this.model,
        maxTokens: 4096,
        prompt
      });
      return sanitizeDrafts(JSON.parse(text));
    } catch (error) {
      this.logger?.warn(`Drafting failed for ${lead.business_name}: ${error.message}`);
      return { error: `Drafting failed: ${error.message}` };
    }
  }

  buildDraftingPrompt(lead) {
    const reviewSnippets = (lead.reviews_data || [])
      .slice(0, 5)
      .map(r => `- "${r.review_text}"`)
      .join('\n');

    return `You are writing cold outreach messages for someone who works with commercial facilities on cleaning services in Metro Vancouver.

CRITICAL RULES:
- Do NOT mention any company name
- Do NOT pitch any service
- The ONLY goal is to start a conversation
- Be genuine and specific to this business
- Keep emails under 80 words
- Keep DMs under 40 words
- Write like a real local operator, not a marketing assistant
- Use normal punctuation: commas, periods, question marks, apostrophes, and colons
- Do NOT use em dashes, double hyphens, tildes, markdown, bullets, emojis, or decorative separators
- Do NOT overpraise. One specific observation is enough
- Avoid phrases that sound automated, including "impressive to see", "consistent turnout", "great operations", and "quick question"
- Use contractions naturally where they fit
- Make each message sound like one person wrote it directly to one business

BUSINESS:
- Name: ${lead.business_name}
- Type: ${lead.type || 'Commercial facility'}
- Address: ${lead.formatted_address || 'Metro Vancouver'}
- Rating: ${lead.rating ?? 'N/A'}/5 (${lead.reviews_count ?? 0} reviews)

REVIEW SNIPPETS:
${reviewSnippets || 'No reviews available'}

SCORING INSIGHT: ${lead.reasoning || 'No scoring data'}

Write 3 styles of outreach. For each, write an email (subject + body) and a short DM.

STYLE 1 - Curious Neighbor: Casual, ask how they handle cleaning. Reference being in their area.
STYLE 2 - Value Lead: Share a quick cleaning tip relevant to their business type, then ask a question.
STYLE 3 - Compliment + Question: Compliment something specific, then ask about their cleaning setup.

Respond with ONLY this JSON (no markdown):
{"curious_neighbor": {"email_subject": "...", "email_body": "...", "dm": "..."}, "value_lead": {"email_subject": "...", "email_body": "...", "dm": "..."}, "compliment_question": {"email_subject": "...", "email_body": "...", "dm": "..."}}`;
  }
}

export function sanitizeDrafts(drafts) {
  for (const style of ['curious_neighbor', 'value_lead', 'compliment_question']) {
    if (!drafts?.[style]) continue;
    drafts[style].email_subject = sanitizeMessageText(drafts[style].email_subject);
    drafts[style].email_body = sanitizeMessageText(drafts[style].email_body);
    drafts[style].dm = sanitizeMessageText(drafts[style].dm);
  }
  return drafts;
}

export function sanitizeMessageText(value) {
  const cleaned = String(value || '')
    .replace(/[~*_`#>]+/g, '')
    .replace(/[\u2014\u2013]+/g, '. ')
    .replace(/\s+-{2,}\s+/g, '. ')
    .replace(/-{2,}/g, '. ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([,.;:?!])([A-Za-z])/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+$/g, '')
    .trim();

  return capitalizeSentenceStarts(cleaned);
}

function capitalizeSentenceStarts(value) {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) =>
    prefix + letter.toUpperCase()
  );
}
