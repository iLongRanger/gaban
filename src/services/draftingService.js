import Anthropic from '@anthropic-ai/sdk';

export default class DraftingService {
  constructor({ apiKey, model, logger, client } = {}) {
    this.model = model || 'claude-haiku-4-5-20251001';
    this.logger = logger;
    this.client = client || new Anthropic({ apiKey });
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
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text;
      return JSON.parse(text);
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
