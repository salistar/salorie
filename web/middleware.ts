import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from './lib/jwt';

// Auth gate basée sur un JWT cookie (login/register custom + MongoDB).
// Remplace l'ancien HTTP Basic Auth. Edge-safe (jose uniquement, pas de mongoose).
const PUBLIC = ['/login', '/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Routes publiques : pages d'auth + API d'auth
  if (pathname.startsWith('/api/auth') || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
