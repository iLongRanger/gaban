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

  it('renders the legal footer smaller in the HTML version', () => {
    const { html } = buildOutreachEmail({
      sendId: 7,
      subject: 'Hello',
      body: 'Hi there.',
      config: CONFIG,
    });
    assert.ok(html.includes('font-size:11px'), 'footer should use small text');
    assert.ok(html.includes('color:#6b7280'), 'footer should use muted text');
    assert.ok(html.includes('https://outreach.gleampro.ca/u/'), 'missing unsubscribe link');
    assert.ok(html.includes('Hi there.'), 'missing message body');
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

  it('appends the sender signature block above the legal footer when provided', () => {
    const { body, html } = buildOutreachEmail({
      sendId: 9,
      subject: 'hi',
      body: 'Body text.',
      config: {
        ...CONFIG,
        senderName: 'Ralp Ortiz',
        senderRole: 'Owner, Gleam Pro Cleaning',
        senderPhone: '778 681 0922',
        senderWebsite: 'gleampro.ca',
      },
    });
    assert.ok(body.includes('Ralp Ortiz'), 'missing sender name');
    assert.ok(body.includes('Owner, Gleam Pro Cleaning'), 'missing sender role');
    assert.ok(body.includes('778 681 0922'), 'missing sender phone');
    assert.ok(body.includes('gleampro.ca'), 'missing sender website');
    assert.ok(body.indexOf('Ralp Ortiz') < body.indexOf('Gleam & Lift Solutions'), 'signature should sit above legal footer');
    assert.ok(html.includes('Ralp Ortiz'), 'html missing sender name');
    assert.ok(html.includes('778 681 0922'), 'html missing sender phone');
  });

  it('omits the signature block entirely when no sender fields are configured', () => {
    const { body } = buildOutreachEmail({
      sendId: 9,
      subject: 'hi',
      body: 'Body text.',
      config: CONFIG,
    });
    assert.ok(!body.includes('Ralp Ortiz'));
    assert.match(body, /Body text\.\n\n—/);
  });
});
