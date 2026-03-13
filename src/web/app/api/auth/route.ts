import { NextRequest, NextResponse } from 'next/server';
import { verifyPin, createSessionCookie } from '@/lib/auth.js';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pin } = body;

  if (!pin || !verifyPin(pin)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  const cookie = createSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set('gaban-session', cookie, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('gaban-session');
  return response;
}
