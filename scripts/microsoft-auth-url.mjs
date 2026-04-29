import dotenv from 'dotenv';

dotenv.config();

const tenantId = process.env.MICROSOFT_TENANT_ID;
const clientId = process.env.MICROSOFT_CLIENT_ID;
const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3010/api/auth/microsoft/callback';

if (!tenantId || !clientId) {
  console.error('MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID are required');
  process.exit(1);
}

const params = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  response_mode: 'query',
  scope: 'offline_access Mail.Send Mail.Read User.Read',
  prompt: 'consent',
});

console.log(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params}`);
