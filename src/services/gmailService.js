import { google } from 'googleapis';

function sanitizeHeader(value, field) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  if (/[\r\n]/.test(value)) throw new Error(`${field} must not contain line breaks`);
  return value;
}

function buildRawMessage({ to, from, subject, body, inReplyTo }) {
  const headers = [
    `From: ${sanitizeHeader(from, 'from')}`,
    `To: ${sanitizeHeader(to, 'to')}`,
    `Subject: ${sanitizeHeader(subject, 'subject')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (inReplyTo) {
    const safe = sanitizeHeader(inReplyTo, 'inReplyTo');
    headers.push(`In-Reply-To: ${safe}`);
    headers.push(`References: ${safe}`);
  }
  const raw = headers.join('\r\n') + '\r\n\r\n' + body;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function createGmailClientFromEnv(env = process.env) {
  const clientId = env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN are required');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

export class GmailService {
  constructor({ client, sender, logger }) {
    if (!client) throw new Error('client required');
    if (!sender?.email) throw new Error('sender.email required');
    this.client = client;
    this.sender = sender;
    this.logger = logger;
  }

  async send({ to, subject, body, threadId, inReplyTo }) {
    if (!to) throw new Error('to required');
    if (!subject) throw new Error('subject required');
    if (!body) throw new Error('body required');

    const from = this.sender.name
      ? `${this.sender.name} <${this.sender.email}>`
      : this.sender.email;

    const raw = buildRawMessage({ to, from, subject, body, inReplyTo });

    const requestBody = { raw };
    if (threadId) requestBody.threadId = threadId;

    const response = await this.client.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      gmail_message_id: response.data.id,
      gmail_thread_id: response.data.threadId,
    };
  }

  async listMessages({ query = 'in:inbox newer_than:7d', maxResults = 25 } = {}) {
    const response = await this.client.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });
    return response.data.messages || [];
  }

  async getMessage({ id, format = 'metadata', metadataHeaders } = {}) {
    if (!id) throw new Error('id required');
    const response = await this.client.users.messages.get({
      userId: 'me',
      id,
      format,
      metadataHeaders,
    });
    return response.data;
  }
}
