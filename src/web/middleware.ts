import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/auth.js';

export const runtime = 'nodejs'; // Required: auth uses node:crypto

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/unsubscribe/', '/u/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('gaban-session')?.value;
  const isValid = cookie ? verifySessionCookie(cookie) : false;

  if (!isValid) {
    // API routes get 401, pages get redirected
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
