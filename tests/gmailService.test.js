import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GmailService } from '../src/services/gmailService.js';

function makeFakeClient({ sendResult, sendError }) {
  const calls = [];
  const fake = {
    users: {
      messages: {
        send: async (args) => {
          calls.push(args);
          if (sendError) throw sendError;
          return { data: sendResult };
        },
        list: async (args) => {
          calls.push(args);
          return { data: { messages: [{ id: 'msg-1', threadId: 'thread-1' }] } };
        },
        get: async (args) => {
          calls.push(args);
          return { data: { id: args.id, threadId: 'thread-1', payload: { headers: [] } } };
        },
      },
    },
  };
  return { fake, calls };
}

describe('GmailService', () => {
  const sender = { email: 'outreach@outreach.gleampro.ca', name: 'GleamPro' };

  it('sends a message and returns gmail ids', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'msg123', threadId: 'thr123' },
    });
    const svc = new GmailService({ client: fake, sender });

    const result = await svc.send({
      to: 'dest@example.com',
      subject: 'Hi',
      body: 'Hello world.',
    });

    assert.strictEqual(result.gmail_message_id, 'msg123');
    assert.strictEqual(result.gmail_thread_id, 'thr123');
    assert.strictEqual(calls.length, 1);
    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('To: dest@example.com'));
    assert.ok(raw.includes('From: GleamPro <outreach@outreach.gleampro.ca>'));
    assert.ok(raw.includes('Subject: Hi'));
    assert.ok(raw.includes('Hello world.'));
  });

  it('threads follow-ups via In-Reply-To and References', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'msg2', threadId: 'thr123' },
    });
    const svc = new GmailService({ client: fake, sender });

    await svc.send({
      to: 'dest@example.com',
      subject: 'Re: Hi',
      body: 'Follow up.',
      threadId: 'thr123',
      inReplyTo: '<msg1@mail.gmail.com>',
    });

    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('In-Reply-To: <msg1@mail.gmail.com>'));
    assert.ok(raw.includes('References: <msg1@mail.gmail.com>'));
    assert.strictEqual(calls[0].requestBody.threadId, 'thr123');
  });

  it('wraps the body as text/plain with utf-8', async () => {
    const { fake, calls } = makeFakeClient({
      sendResult: { id: 'm', threadId: 't' },
    });
    const svc = new GmailService({ client: fake, sender });
    await svc.send({ to: 'x@y.com', subject: 's', body: 'café' });
    const raw = Buffer.from(calls[0].requestBody.raw, 'base64url').toString('utf8');
    assert.ok(raw.includes('Content-Type: text/plain; charset="UTF-8"'));
    assert.ok(raw.includes('café'));
  });

  it('surfaces send errors', async () => {
    const err = new Error('quota exceeded');
    const { fake } = makeFakeClient({ sendError: err });
    const svc = new GmailService({ client: fake, sender });
    await assert.rejects(
      () => svc.send({ to: 'x@y.com', subject: 's', body: 'b' }),
      /quota exceeded/
    );
  });

  it('rejects missing to/subject/body', async () => {
    const { fake } = makeFakeClient({ sendResult: { id: 'm', threadId: 't' } });
    const svc = new GmailService({ client: fake, sender });
    await assert.rejects(() => svc.send({ subject: 's', body: 'b' }), /to/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', body: 'b' }), /subject/i);
    await assert.rejects(() => svc.send({ to: 'x@y.com', subject: 's' }), /body/i);
  });

  it('rejects header values containing CRLF (injection guard)', async () => {
    const { fake } = makeFakeClient({ sendResult: { id: 'm', threadId: 't' } });
    const svc = new GmailService({ client: fake, sender });
    await assert.rejects(
      () => svc.send({ to: 'x@y.com\r\nBcc: evil@x.com', subject: 's', body: 'b' }),
      /line breaks/i,
    );
    await assert.rejects(
      () => svc.send({ to: 'x@y.com', subject: 'Hi\nBcc: evil@x.com', body: 'b' }),
      /line breaks/i,
    );
  });

  it('lists and gets inbox messages', async () => {
    const { fake, calls } = makeFakeClient({ sendResult: { id: 'm', threadId: 't' } });
    const svc = new GmailService({ client: fake, sender });

    const messages = await svc.listMessages({ query: 'in:inbox newer_than:1d', maxResults: 10 });
    const message = await svc.getMessage({
      id: 'msg-1',
      metadataHeaders: ['From', 'Subject'],
    });

    assert.deepStrictEqual(messages, [{ id: 'msg-1', threadId: 'thread-1' }]);
    assert.strictEqual(message.id, 'msg-1');
    assert.strictEqual(calls[0].q, 'in:inbox newer_than:1d');
    assert.strictEqual(calls[0].maxResults, 10);
    assert.strictEqual(calls[1].format, 'metadata');
    assert.deepStrictEqual(calls[1].metadataHeaders, ['From', 'Subject']);
  });
});
