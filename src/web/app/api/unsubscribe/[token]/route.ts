import '@/lib/loadEnv.js';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { confirmUnsubscribe } from '../../../../../services/unsubscribeService.js';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const result = confirmUnsubscribe({
      db: getDb(),
      token,
      secret: process.env.UNSUBSCRIBE_TOKEN_SECRET
    });

    return new NextResponse(successHtml(result.email), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new NextResponse(errorHtml(message), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }
}

function successHtml(email: string) {
  return pageHtml(
    'You have been unsubscribed.',
    `<p>We will no longer contact <strong>${escapeHtml(email)}</strong>.</p>`
  );
}

function errorHtml(message: string) {
  return pageHtml(
    'We could not process that unsubscribe link.',
    `<p>The link may have expired or been changed. Please reply with STOP and we will remove you manually.</p><p style="color:#888;font-size:13px">Error: ${escapeHtml(message)}</p>`
  );
}

function pageHtml(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family:system-ui,sans-serif;line-height:1.6;margin:0">
    <main style="max-width:560px;margin:64px auto;padding:0 24px">
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
