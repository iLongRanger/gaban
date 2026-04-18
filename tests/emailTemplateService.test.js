import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreachEmail } from '../src/services/emailTemplateService.js';

const CONFIG = {
  legalName: 'Gleam & Lift Solutions',
  operatingName: 'GleamPro Cleaning',
  mailingAddress: 'Set 6 — 1209 Fourth Avenue, New Westminster, BC V3M 1T8',
  publicAppUrl: 'https://outreach.gleampro.ca',
  tokenSecret: 'test-secret',
};

describe('buildOutreachEmail', () => {
  it('appends the CASL footer to body', () => {
    const { body } = buildOutreachEmail({
      sendId: 7,
      subject: 'Hello',
      body: 'Hi there.',
      config: CONFIG,
    });
    assert.ok(body.includes('Gleam & Lift Solutions'), 'missing legal name');
    assert.ok(body.includes('GleamPro Cleaning'), 'missing operating name');
    assert.ok(body.includes('Set 6 — 1209 Fourth Avenue'), 'missing mailing address');
    assert.ok(body.includes('Unsubscribe'), 'missing unsubscribe label');
    assert.ok(body.includes('https://outreach.gleampro.ca/u/'), 'missing unsubscribe URL');
  });

  it('leaves subject unchanged', () => {
    const { subject } = buildOutreachEmail({
      sendId: 7,
      subject: 'My Subject',
      body: 'Body',
      config: CONFIG,
    });
    assert.strictEqual(subject, 'My Subject');
  });

  it('embeds a verifiable unsubscribe token for the given sendId', async () => {
    const { verifyUnsubscribeToken } = await import('../src/services/unsubscribeTokenService.js');
    const { body } = buildOutreachEmail({
      sendId: 42,
      subject: 'x',
      body: 'y',
      config: CONFIG,
    });
    const match = body.match(/\/u\/([^\s)]+)/);
    assert.ok(match, 'token not found in body');
    const payload = verifyUnsubscribeToken(match[1], CONFIG.tokenSecret);
    assert.strictEqual(payload.sendId, 42);
  });

  it('throws if sendId missing', () => {
    assert.throws(() => buildOutreachEmail({
      subject: 'x',
      body: 'y',
      config: CONFIG,
    }), /sendId/i);
  });

  it('throws if config missing a required field', () => {
    const bad = { ...CONFIG, legalName: undefined };
    assert.throws(() => buildOutreachEmail({
      sendId: 1, subject: 'x', body: 'y', config: bad,
    }), /legalName/i);
  });
});
