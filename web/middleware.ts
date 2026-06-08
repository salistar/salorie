import { NextRequest, NextResponse } from 'next/server';

// HTTP Basic Auth gate for the whole admin. Credentials from env
// (ADMIN_USER / ADMIN_PASS). If ADMIN_PASS is unset, the admin stays open
// (local dev) — in production the deploy always sets it.
export function middleware(req: NextRequest) {
  const USER = process.env.ADMIN_USER || 'admin';
  const PASS = process.env.ADMIN_PASS || '';
  if (!PASS) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      const [u, p] = atob(encoded).split(':');
      if (u === USER && p === PASS) return NextResponse.next();
    } catch {}
  }
  return new NextResponse('Authentification requise', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Salorie Admin", charset="UTF-8"' },
  });
}

export const config = {
  // Protect everything except Next internals + favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
