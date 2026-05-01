import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  curious_neighbor: {
    email_subject: 'Quick question about your space',
    email_body: 'Hi Joe, I was walking by your bistro...',
    dm: 'Hey Joe\'s Bistro! Love the space...'
  },
  value_lead: {
    email_subject: 'Tip for restaurant operators',
    email_body: 'Hi there, I work with commercial...',
    dm: 'Hey! Quick tip for busy restaurants...'
  },
  compliment_question: {
    email_subject: 'Impressed by Joe\'s Bistro',
    email_body: 'Hi, I noticed your great reviews...',
    dm: 'Your reviews are amazing! Quick question...'
  }
});

function createMockClient(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }]
      })
    }
  };
}

const SAMPLE_LEAD = {
  business_name: 'Joe\'s Bistro',
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  rating: 4.2,
  reviews_count: 85,
  reviews_data: [
    { review_text: 'Great food, cozy space', review_rating: 5 }
  ],
  reasoning: 'Strong cleanliness signals'
};

test('draftOutreach returns 3 styles with email and DM for each', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  assert.ok(drafts.curious_neighbor);
  assert.ok(drafts.value_lead);
  assert.ok(drafts.compliment_question);
  assert.ok(drafts.curious_neighbor.email_subject);
  assert.ok(drafts.curious_neighbor.email_body);
  assert.ok(drafts.curious_neighbor.dm);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = {
    messages: { create: async () => { throw new Error('API down'); } }
  };
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  assert.ok(drafts.error);
});

test('draftAllLeads returns drafts for each lead', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });

  const results = await service.draftAllLeads([SAMPLE_LEAD, SAMPLE_LEAD]);

  assert.equal(results.length, 2);
  assert.ok(results[0].curious_neighbor);
});

test('draftOutreach sanitizes AI-looking punctuation', async () => {
  const response = JSON.stringify({
    curious_neighbor: {
      email_subject: 'Question -- cleaning',
      email_body: 'Hi  Joe ~~ nice rating -- who handles cleaning right now  in-house staff or outside help?',
      dm: 'Hi Joe -- who handles cleaning?'
    },
    value_lead: {
      email_subject: 'Floor tip',
      email_body: 'A simple mat rotation helps -- especially near the front.',
      dm: 'A simple mat rotation helps -- especially near the front.'
    },
    compliment_question: {
      email_subject: 'Your reviews',
      email_body: 'Your reviews stand out\u2014who handles the cleaning schedule?',
      dm: 'Reviews look strong\u2014who handles cleaning?'
    }
  });
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(response) });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  assert.equal(drafts.curious_neighbor.email_subject, 'Question. Cleaning');
  assert.equal(
    drafts.curious_neighbor.email_body,
    'Hi Joe nice rating. Who handles cleaning right now in-house staff or outside help?'
  );
  assert.equal(drafts.compliment_question.email_body, 'Your reviews stand out. Who handles the cleaning schedule?');
});

test('sanitizeMessageText fixes spacing around punctuation', () => {
  assert.equal(
    sanitizeMessageText('Hi there  , can I ask who manages supplies right now ?'),
    'Hi there, can I ask who manages supplies right now?'
  );
});
