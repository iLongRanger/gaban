import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1: { email_subject: 'one thing for your patio', email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2: { email_subject: 'follow up on the checklist',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3: { email_subject: 'should I close the file?',    email_body: 'Hi, ...', dm: 'Hey ...' },
});

function createMockClient(responseText) {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: responseText }] }),
    },
  };
}

const SAMPLE_LEAD = {
  business_name: "Joe's Bistro",
  type: 'Restaurant',
  formatted_address: '123 Main St, Burnaby',
  rating: 4.2,
  reviews_count: 85,
  reviews_data: [{ review_text: 'Great food, cozy space', review_rating: 5 }],
  reasoning: 'Strong cleanliness signals',
};

test('draftOutreach returns three touch variants with email and DM each', async () => {
  const client = createMockClient(DRAFT_RESPONSE);
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });

  const drafts = await service.draftOutreach(SAMPLE_LEAD);

  for (const key of ['touch_1', 'touch_2', 'touch_3']) {
    assert.ok(drafts[key], `${key} missing`);
    assert.ok(drafts[key].email_subject, `${key}.email_subject missing`);
    assert.ok(drafts[key].email_body,    `${key}.email_body missing`);
    assert.ok(drafts[key].dm,            `${key}.dm missing`);
  }
});

test('buildDraftingPrompt includes the resolved vertical and a give-first touch-1 directive', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1/);
  assert.match(prompt, /TOUCH 3.*breakup/is);
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
});

test('buildDraftingPrompt swaps vertical pain hooks per vertical', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurantPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const breweryPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  assert.match(restaurantPrompt, /grease|hood|inspection|stainless/i);
  assert.match(breweryPrompt,    /glycol|drain|floor|kegerator/i);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = { messages: { create: async () => { throw new Error('api down'); } } };
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  assert.match(drafts.error, /Drafting failed/);
});

test('sanitizeMessageText still strips em dashes and markdown', () => {
  const result = sanitizeMessageText('Hello — world *bold* and __under__');
  assert.doesNotMatch(result, /[—–*_]/);
});

test('sanitizeMessageText collapses repeated periods left by other replacements', () => {
  assert.equal(sanitizeMessageText('signature.. Owner'), 'Signature. Owner');
  assert.equal(sanitizeMessageText('time . . Thanks'), 'Time. Thanks');
});
