import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText, stripTrailingSignature, sanitizeDrafts } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1_poke:  { email_subject: 'overnight clean',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_1_route: { email_subject: 'cleaning',         email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2:       { email_subject: 'spots that slip',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3:       { email_subject: 'one quick thing',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_4:       { email_subject: 'closing the file', email_body: 'Hi, ...', dm: 'Hey ...' },
});

function createMockClient(responseText) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text: responseText }] }) } };
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

test('draftOutreach returns five drafts: two opener arms plus touches 2-4', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  for (const key of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
    assert.ok(drafts[key], `${key} missing`);
    assert.ok(drafts[key].email_subject, `${key}.email_subject missing`);
    assert.ok(drafts[key].email_body, `${key}.email_body missing`);
    assert.ok(drafts[key].dm, `${key}.dm missing`);
  }
});

test('prompt describes both opener arms and the 1-2-3 breakup, and drops the invoice ask', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1 ARM A/);
  assert.match(prompt, /TOUCH 1 ARM B/);
  assert.match(prompt, /1 . worth a quick chat/i);
  assert.doesNotMatch(prompt, /invoice/i);
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
});

test('prompt swaps social proof and gap examples per vertical', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurant = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const brewery    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  assert.match(restaurant, /New West Station/i);
  assert.match(brewery,    /East Van/i);
  assert.match(restaurant, /hood vent|grout|bar/i);
});

test('industrial uses credential-only social proof (no fabricated client)', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Warehouse' });
  assert.match(prompt, /Vertical:\s*industrial/);
  assert.match(prompt, /insured, registered crew of five/i);
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

test('stripTrailingSignature removes Thanks + name + phone block', () => {
  const input = [
    'Hope your patio holds up through the wet stretch.',
    '',
    'Thanks,',
    'Ralp Ortiz',
    'Owner, Gleam Pro Cleaning',
    '778 681 0922',
    'gleampro.ca',
  ].join('\n');
  const out = stripTrailingSignature(input);
  assert.equal(out, 'Hope your patio holds up through the wet stretch.');
});

test('stripTrailingSignature strips a bare phone number tail', () => {
  const input = 'Drop a note if useful.\n778-681-0922';
  assert.equal(stripTrailingSignature(input), 'Drop a note if useful.');
});

test('stripTrailingSignature keeps body that ends with a real sentence', () => {
  const input = 'No need to reply if not useful.';
  assert.equal(stripTrailingSignature(input), 'No need to reply if not useful.');
});

test('sanitizeDrafts applies signature stripping to all five touch bodies', () => {
  const body = 'Reply with a couple of times that work.\n\nThanks,\nAlex Morgan\n604 555 0101';
  const drafts = {
    touch_1_poke:  { email_subject: 'overnight clean',  email_body: body, dm: 'Quick note.' },
    touch_1_route: { email_subject: 'cleaning',         email_body: body, dm: 'Quick note.' },
    touch_2:       { email_subject: 'spots that slip',  email_body: body, dm: 'Quick note.' },
    touch_3:       { email_subject: 'one quick thing',  email_body: body, dm: 'Quick note.' },
    touch_4:       { email_subject: 'closing the file', email_body: body, dm: 'Quick note.' },
  };
  const cleaned = sanitizeDrafts(drafts);
  for (const key of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
    assert.doesNotMatch(cleaned[key].email_body, /Alex Morgan/, `${key} still has name`);
    assert.doesNotMatch(cleaned[key].email_body, /604 555 0101/, `${key} still has phone`);
    assert.doesNotMatch(cleaned[key].email_body, /Thanks,/, `${key} still has sign-off`);
  }
});
