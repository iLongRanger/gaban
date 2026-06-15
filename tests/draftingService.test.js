import test from 'node:test';
import assert from 'node:assert/strict';
import DraftingService, { sanitizeMessageText, stripTrailingSignature, sanitizeDrafts, stripSenderLocationClaims } from '../src/services/draftingService.js';

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

test('prompt never feeds the lead address as the sender location or invites proximity claims', () => {
  const service = new DraftingService({ apiKey: 'test', model: 'gpt-5-mini', client: createMockClient(DRAFT_RESPONSE) });
  const prompt = service.buildDraftingPrompt(SAMPLE_LEAD);
  // The lead's own address must never appear — it was being mislabeled as the sender's area,
  // which produced "I run a cleaning crew out of {recipient's address}".
  assert.doesNotMatch(prompt, /123 Main St/);
  assert.doesNotMatch(prompt, /sender's area, use the city in this address/i);
  // The prompt must forbid sender street addresses and proximity/neighbour claims.
  assert.match(prompt, /never state a street address/i);
  assert.match(prompt, /never claim to be nearby, a neighbour/i);
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

test('stripSenderLocationClaims removes a sentence attributing a street address to the sender', () => {
  const input = "I noticed your busy lunches. I run a cleaning crew out of 4260 Hastings St, Burnaby. How do you handle it?";
  const out = stripSenderLocationClaims(input);
  assert.doesNotMatch(out, /4260 Hastings/);
  assert.doesNotMatch(out, /crew out of/i);
  assert.match(out, /I noticed your busy lunches\./);
  assert.match(out, /How do you handle it\?/);
});

test('stripSenderLocationClaims removes neighbour and walk-past proximity claims', () => {
  const input = "Hi, I'm a neighbour in Metro Vancouver and walk past your place often. How do you handle nightly cleaning?";
  const out = stripSenderLocationClaims(input);
  assert.doesNotMatch(out, /neighbou?r/i);
  assert.doesNotMatch(out, /walk past/i);
  assert.match(out, /How do you handle nightly cleaning\?/);
});

test('stripSenderLocationClaims handles smart apostrophes, "pass by", and "operate nearby"', () => {
  // Real stored drafts use curly apostrophes (U+2019).
  const a = stripSenderLocationClaims('Hi, I’m nearby in Metro Vancouver and pass by your cafe often. How do you handle cleaning?');
  assert.doesNotMatch(a, /nearby|pass by/i);
  assert.match(a, /How do you handle cleaning\?/);

  const b = stripSenderLocationClaims('Hi, I operate nearby on Columbia Street and pass by your shop a lot. Who handles cleaning?');
  assert.doesNotMatch(b, /operate nearby|pass by|Columbia Street/i);
  assert.match(b, /Who handles cleaning\?/);

  const c = stripSenderLocationClaims('Hi, I’m a local operator a few blocks away in Metro Vancouver. How do you handle end-of-day cleaning?');
  assert.doesNotMatch(c, /a few blocks/i);
  assert.match(c, /How do you handle end-of-day cleaning\?/);
});

test('stripSenderLocationClaims strips sender base city ("crew out of Burnaby") and bare neighbour claims', () => {
  const a = stripSenderLocationClaims('I run a local cleaning crew out of Burnaby and handle kitchens. How do you manage it?');
  assert.doesNotMatch(a, /crew out of|Burnaby/i);
  assert.match(a, /How do you manage it\?/);

  const b = stripSenderLocationClaims('Neighbour here in Metro Vancouver. How do you handle nightly cleaning?');
  assert.doesNotMatch(b, /neighbou?r/i);
  assert.match(b, /How do you handle nightly cleaning\?/);

  // Must not break the benign idiom or general-area mentions.
  assert.equal(
    stripSenderLocationClaims('Out of curiosity, how do you handle cleaning in the neighbourhood?'),
    'Out of curiosity, how do you handle cleaning in the neighbourhood?'
  );
});

test('stripSenderLocationClaims keeps benign "Out of curiosity"', () => {
  const input = 'Out of curiosity, how do you handle day-to-day cleaning between rushes?';
  assert.equal(stripSenderLocationClaims(input), input);
});

test('sanitizeDrafts strips sender-location claims from all five bodies', () => {
  const body = 'Quick thought for you. I run a cleaning crew out of 4260 Hastings St. Reply if useful.';
  const drafts = {
    touch_1_poke:  { email_subject: 'overnight clean',  email_body: body, dm: body },
    touch_1_route: { email_subject: 'cleaning',         email_body: body, dm: body },
    touch_2:       { email_subject: 'spots that slip',  email_body: body, dm: body },
    touch_3:       { email_subject: 'one quick thing',  email_body: body, dm: body },
    touch_4:       { email_subject: 'closing the file', email_body: body, dm: body },
  };
  const cleaned = sanitizeDrafts(drafts);
  for (const key of ['touch_1_poke', 'touch_1_route', 'touch_2', 'touch_3', 'touch_4']) {
    assert.doesNotMatch(cleaned[key].email_body, /4260 Hastings|crew out of/i, `${key} body still leaks address`);
    assert.doesNotMatch(cleaned[key].dm, /4260 Hastings|crew out of/i, `${key} dm still leaks address`);
    assert.match(cleaned[key].email_body, /Reply if useful\./, `${key} dropped benign content`);
  }
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
