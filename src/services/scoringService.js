import { calculateDistance } from '../utils/geo.js';
import OpenAiJsonClient, { createJsonCompletion } from './openAiJsonClient.js';

export default class ScoringService {
  constructor({ apiKey, model, logger, client } = {}) {
    this.model = model || 'gpt-5-mini';
    this.logger = logger;
    this.client = client || new OpenAiJsonClient({ apiKey });
  }

  async scoreLeads(leads, officeLocation) {
    const scored = [];

    for (const lead of leads) {
      const distance = calculateDistance(officeLocation, lead.location);
      const score = await this.scoreSingleLead(lead, distance);
      scored.push({ ...lead, ...score, distance_km: Math.round(distance * 10) / 10 });
    }

    scored.sort((a, b) => b.total_score - a.total_score);
    return scored;
  }

  async scoreSingleLead(lead, distanceKm) {
    const prompt = this.buildScoringPrompt(lead, distanceKm);

    try {
      const text = await createJsonCompletion(this.client, {
        model: this.model,
        maxTokens: 2048,
        prompt
      });
      const parsed = JSON.parse(text);

      return {
        total_score: parsed.total_score,
        factor_scores: parsed.factor_scores,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      this.logger?.warn(`Scoring failed for ${lead.business_name}: ${error.message}`);
      return {
        total_score: 0,
        factor_scores: {},
        reasoning: `Scoring failed: ${error.message}`
      };
    }
  }

  buildScoringPrompt(lead, distanceKm) {
    const reviewTexts = (lead.reviews_data || [])
      .slice(0, 10)
      .map(r => `- (${r.review_rating}/5) ${r.review_text}`)
      .join('\n');

    return `You are a lead scoring assistant for a commercial cleaning company in Metro Vancouver.

Score this business as a potential cleaning service client on a 0-100 scale.

BUSINESS DATA:
- Name: ${lead.business_name}
- Type: ${lead.type || 'Unknown'}
- Address: ${lead.formatted_address || 'Unknown'}
- Distance from our office: ${distanceKm.toFixed(1)} km
- Rating: ${lead.rating ?? 'N/A'} (${lead.reviews_count ?? 0} reviews)
- Photos: ${lead.photo_count ?? 0}
- Hours: ${lead.working_hours || 'Unknown'}
- Website: ${lead.website || 'None'}
- Email: ${lead.email || 'None'}
- Instagram: ${lead.instagram || 'None'}
- Facebook: ${lead.facebook || 'None'}

RECENT REVIEWS:
${reviewTexts || 'No reviews available'}

SCORING FACTORS (weights):
1. Size signals (20%): More reviews, photos, longer hours = larger facility
2. Cleanliness pain (20%): Reviews mentioning dirty, messy, sticky, smell, washroom issues
3. Location (15%): Closer to New Westminster = higher score (max 50km)
4. Online presence (15%): Has website, email, social = more reachable and established
5. Business age (15%): Newer businesses (1-3 years) may need help setting up operations
6. No current cleaner (15%): No mentions of cleaning service = likely opportunity

Respond with ONLY this JSON (no markdown, no explanation):
{"total_score": <0-100>, "factor_scores": {"size": <0-20>, "cleanliness_pain": <0-20>, "location": <0-15>, "online_presence": <0-15>, "business_age": <0-15>, "no_current_cleaner": <0-15>}, "reasoning": "<1-2 sentences>"}`;
  }

  selectTopN(leads, n) {
    return [...leads].sort((a, b) => b.total_score - a.total_score).slice(0, n);
  }
}
