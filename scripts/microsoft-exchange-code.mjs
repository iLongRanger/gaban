import dotenv from 'dotenv';

dotenv.config();

const code = process.argv[2];
if (!code) {
  console.error('Usage: node scripts/microsoft-exchange-code.mjs <authorization-code>');
  process.exit(1);
}

const tenantId = process.env.MICROSOFT_TENANT_ID;
const clientId = process.env.MICROSOFT_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3010/api/auth/microsoft/callback';

for (const [key, value] of Object.entries({ tenantId, clientId, clientSecret })) {
  if (!value) {
    console.error(`${key} is required`);
    process.exit(1);
  }
}

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  code,
  redirect_uri: redirectUri,
  scope: 'offline_access Mail.Send Mail.Read User.Read',
  grant_type: 'authorization_code',
});

const response = await fetch(
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  },
);

const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data);
  process.exit(1);
}

console.log('Add this to .env:');
console.log(`MICROSOFT_REFRESH_TOKEN=${data.refresh_token}`);
