function sanitizeHeader(value, field) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  if (/[\r\n]/.test(value)) throw new Error(`${field} must not contain line breaks`);
  return value;
}

function requiredEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`${key} env var is required`);
  return value;
}

export class MicrosoftGraphClient {
  constructor({ tenantId, clientId, clientSecret, refreshToken, fetchImpl = fetch } = {}) {
    if (!tenantId) throw new Error('tenantId required');
    if (!clientId) throw new Error('clientId required');
    if (!clientSecret) throw new Error('clientSecret required');
    if (!fetchImpl) throw new Error('fetch implementation required');
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.fetch = fetchImpl;
    this.accessToken = null;
    this.expiresAt = 0;
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAt - 60000) {
      return this.accessToken;
    }

    const params = this.refreshToken
      ? new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          scope: 'offline_access Mail.Send Mail.Read User.Read',
          grant_type: 'refresh_token',
        })
      : new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        });

    const response = await this.fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error_description || data.error || `Token request failed: ${response.status}`);
    }

    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
    this.accessToken = data.access_token;
    this.expiresAt = now + Number(data.expires_in || 3600) * 1000;
    return this.accessToken;
  }

  async sendMail({ senderEmail, message, saveToSentItems = true }) {
    if (!message) throw new Error('message required');

    const token = await this.getAccessToken();
    const endpoint = this.refreshToken
      ? 'https://graph.microsoft.com/v1.0/me/sendMail'
      : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

    if (!this.refreshToken && !senderEmail) throw new Error('senderEmail required');

    const response = await this.fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Microsoft Graph sendMail failed: ${response.status}`);
    }

    return { accepted: true, status: response.status };
  }
}

export function createMicrosoftGraphClientFromEnv(env = process.env) {
  return new MicrosoftGraphClient({
    tenantId: requiredEnv(env, 'MICROSOFT_TENANT_ID'),
    clientId: requiredEnv(env, 'MICROSOFT_CLIENT_ID'),
    clientSecret: requiredEnv(env, 'MICROSOFT_CLIENT_SECRET'),
    refreshToken: env.MICROSOFT_REFRESH_TOKEN,
  });
}

export class MicrosoftGraphMailService {
  constructor({ client, sender, logger } = {}) {
    if (!client) throw new Error('client required');
    if (!sender?.email) throw new Error('sender.email required');
    this.client = client;
    this.sender = sender;
    this.logger = logger;
  }

  async send({ to, subject, body }) {
    const safeTo = sanitizeHeader(to, 'to');
    const safeSubject = sanitizeHeader(subject, 'subject');
    if (!body) throw new Error('body required');

    const message = {
      subject: safeSubject,
      body: {
        contentType: 'Text',
        content: body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: safeTo,
          },
        },
      ],
    };

    const result = await this.client.sendMail({
      senderEmail: this.sender.email,
      message,
      saveToSentItems: true,
    });

    return {
      provider: 'microsoft_graph',
      accepted: result.accepted === true,
      status: result.status,
    };
  }
}
