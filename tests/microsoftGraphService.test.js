import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MicrosoftGraphClient,
  MicrosoftGraphMailService,
  createMicrosoftGraphClientFromEnv,
} from '../src/services/microsoftGraphService.js';

function makeFakeMailClient({ sendResult, sendError } = {}) {
  const calls = [];
  const fake = {
    sendMail: async (args) => {
      calls.push(args);
      if (sendError) throw sendError;
      return sendResult || { accepted: true, status: 202 };
    },
  };
  return { fake, calls };
}

describe('MicrosoftGraphMailService', () => {
  const sender = { email: 'outreach@gleamlift.ca', name: 'GleamPro Cleaning' };

  it('sends a plain-text message through Microsoft Graph', async () => {
    const { fake, calls } = makeFakeMailClient();
    const svc = new MicrosoftGraphMailService({ client: fake, sender });

    const result = await svc.send({
      to: 'dest@example.com',
      subject: 'Hi',
      body: 'Hello world.',
    });

    assert.deepStrictEqual(result, {
      provider: 'microsoft_graph',
      accepted: true,
      status: 202,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].senderEmail, 'outreach@gleamlift.ca');
    assert.strictEqual(calls[0].saveToSentItems, true);
    assert.strictEqual(calls[0].message.subject, 'Hi');
    assert.strictEqual(calls[0].message.body.contentType, 'Text');
    assert.strictEqual(calls[0].message.body.content, 'Hello world.');
    assert.strictEqual(calls[0].message.toRecipients[0].emailAddress.address, 'dest@example.com');
  });

  it('surfaces send errors', async () => {
    const err = new Error('access denied');
    const { fake } = makeFakeMailClient({ sendError: err });
    const svc = new MicrosoftGraphMailService({ client: fake, sender });

    await assert.rejects(
      () => svc.send({ to: 'dest@example.com', subject: 'Hi', body: 'Hello' }),
      /access denied/,
    );
  });

  it('rejects missing to/subject/body', async () => {
    const { fake } = makeFakeMailClient();
    const svc = new MicrosoftGraphMailService({ client: fake, sender });

    await assert.rejects(() => svc.send({ subject: 's', body: 'b' }), /to/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', body: 'b' }), /subject/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', subject: 's' }), /body/i);
  });

  it('rejects header values containing CRLF', async () => {
    const { fake } = makeFakeMailClient();
    const svc = new MicrosoftGraphMailService({ client: fake, sender });

    await assert.rejects(
      () => svc.send({ to: 'x@y.com\r\nBcc: evil@x.com', subject: 's', body: 'b' }),
      /line breaks/i,
    );
    await assert.rejects(
      () => svc.send({ to: 'x@y.com', subject: 'Hi\nBcc: evil@x.com', body: 'b' }),
      /line breaks/i,
    );
  });
});

describe('MicrosoftGraphClient', () => {
  it('requests a client credentials token and sends mail', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/oauth2/v2.0/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'token123', expires_in: 3600 }),
        };
      }
      return {
        ok: true,
        status: 202,
        text: async () => '',
      };
    };
    const client = new MicrosoftGraphClient({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
      fetchImpl,
    });

    const result = await client.sendMail({
      senderEmail: 'outreach@gleamlift.ca',
      message: { subject: 'Hi' },
    });

    assert.deepStrictEqual(result, { accepted: true, status: 202 });
    assert.strictEqual(requests.length, 2);
    assert.ok(String(requests[0].options.body).includes('grant_type=client_credentials'));
    assert.strictEqual(requests[1].options.headers.Authorization, 'Bearer token123');
    assert.ok(requests[1].url.endsWith('/users/outreach%40gleamlift.ca/sendMail'));
  });

  it('uses refresh token flow and /me/sendMail for delegated auth', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/oauth2/v2.0/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'delegated-token',
            refresh_token: 'rotated-refresh',
            expires_in: 3600,
          }),
        };
      }
      return {
        ok: true,
        status: 202,
        text: async () => '',
      };
    };
    const client = new MicrosoftGraphClient({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      fetchImpl,
    });

    await client.sendMail({
      senderEmail: 'outreach@gleamlift.ca',
      message: { subject: 'Hi' },
    });

    assert.ok(String(requests[0].options.body).includes('grant_type=refresh_token'));
    assert.ok(String(requests[0].options.body).includes('refresh_token=refresh'));
    assert.strictEqual(requests[1].url, 'https://graph.microsoft.com/v1.0/me/sendMail');
    assert.strictEqual(requests[1].options.headers.Authorization, 'Bearer delegated-token');
    assert.strictEqual(client.refreshToken, 'rotated-refresh');
  });

  it('throws a useful token error', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error_description: 'bad secret' }),
    });
    const client = new MicrosoftGraphClient({
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
      fetchImpl,
    });

    await assert.rejects(
      () => client.getAccessToken(),
      /bad secret/,
    );
  });

  it('validates required env vars', () => {
    assert.throws(() => createMicrosoftGraphClientFromEnv({}), /MICROSOFT_TENANT_ID/);
    assert.throws(
      () => createMicrosoftGraphClientFromEnv({ MICROSOFT_TENANT_ID: 't' }),
      /MICROSOFT_CLIENT_ID/,
    );
    assert.throws(
      () => createMicrosoftGraphClientFromEnv({
        MICROSOFT_TENANT_ID: 't',
        MICROSOFT_CLIENT_ID: 'c',
      }),
      /MICROSOFT_CLIENT_SECRET/,
    );
  });
});
