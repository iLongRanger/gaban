import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText, stripTrailingSignature, sanitizeDrafts } from '../src/services/draftingService.js';

const DRAFT_RESPONSE = JSON.stringify({
  touch_1: { email_subject: '15 min walkthrough this week', email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_2: { email_subject: 'price check on your cleaner',  email_body: 'Hi, ...', dm: 'Hey ...' },
  touch_3: { email_subject: 'should I close the file',      email_body: 'Hi, ...', dm: 'Hey ...' },
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

test('buildDraftingPrompt encodes the new three-touch shape', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Vertical:\s*restaurant/);
  assert.match(prompt, /TOUCH 1.*walkthrough/is);
  assert.match(prompt, /TOUCH 2.*invoice/is);
  assert.match(prompt, /TOUCH 3.*breakup/is);
  assert.match(prompt, /free 15-minute walkthrough/i);
  assert.match(prompt, /forward last month'?s invoice/i);
  assert.match(prompt, /close the file/i);
  assert.doesNotMatch(prompt, /Who handles your cleaning/i);
  assert.doesNotMatch(prompt, /one-page checklist/i);
  assert.doesNotMatch(prompt, /reply with "yes"/i);
});

test('buildDraftingPrompt forbids proposed times in touch 1', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Do NOT propose specific dates, days, or time windows/i);
});

test('buildDraftingPrompt swaps vertical pain hooks per vertical', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const restaurantPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Restaurant' });
  const breweryPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Brewery' });
  const medicalPrompt    = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Dental clinic' });
  const civicPrompt      = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'City Hall' });
  const industrialPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Warehouse' });
  const retailPrompt     = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Boutique' });
  const officePrompt     = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Insurance broker' });

  assert.match(restaurantPrompt, /hood|grout|kitchen/i);
  assert.match(breweryPrompt,    /glycol|drain|taproom/i);
  assert.match(medicalPrompt,    /treatment-room|clinic|patient/i);
  assert.match(civicPrompt,      /public-facing|lobby|insured/i);
  assert.match(industrialPrompt, /dust|shop|ledge/i);
  assert.match(retailPrompt,     /storefront|entrance-mat|glass/i);
  assert.match(officePrompt,     /kitchenette|monitor|washroom/i);
});

test('buildDraftingPrompt passes a vertical noun for the touch 2 invoice line', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const medicalPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Dental clinic' });
  const civicPrompt   = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'City Hall' });
  const breweryPrompt = service.buildDraftingPrompt({ ...SAMPLE_LEAD, type: 'Taproom' });
  assert.match(medicalPrompt, /cleaning your clinic/i);
  assert.match(civicPrompt,   /cleaning your facility/i);
  assert.match(breweryPrompt, /cleaning your taproom/i);
});

test('draftOutreach handles API error gracefully', async () => {
  const client = { messages: { create: async () => { throw new Error('api down'); } } };
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client });
  const drafts = await service.draftOutreach(SAMPLE_LEAD);
  assert.match(drafts.error, /Drafting failed/);
});

test('buildDraftingPrompt forbids sign-offs, names, phones, and websites in body', async () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  assert.match(prompt, /Do not name the sender/i);
  assert.match(prompt, /Do NOT end the email with a sign-off/i);
  assert.match(prompt, /No "Thanks"/);
  assert.doesNotMatch(prompt, /my number is in the signature/i);
});

test('sanitizeMessageText still strips em dashes and markdown', () => {
  const result = sanitizeMessageText('Hello — world *bold* and __under__');
  assert.doesNotMatch(result, /[—–*_]/);
});

test('sanitizeMessageText collapses repeated periods left by other replacements', () => {
  assert.equal(sanitizeMessageText('signature.. Owner'), 'Signature. Owner');
  assert.equal(sanitizeMessageText('time . . Thanks'), 'Time. Thanks');
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

test('sanitizeDrafts applies signature stripping to bodies', () => {
  const drafts = {
    touch_1: {
      email_subject: '15 min walkthrough this week',
      email_body: 'Reply with a couple of times that work.\n\nThanks,\nAlex Morgan\n604 555 0101',
      dm: 'Quick note for you.',
    },
  };
  const cleaned = sanitizeDrafts(drafts);
  assert.doesNotMatch(cleaned.touch_1.email_body, /Alex Morgan/);
  assert.doesNotMatch(cleaned.touch_1.email_body, /604 555 0101/);
  assert.doesNotMatch(cleaned.touch_1.email_body, /Thanks,/);
});
