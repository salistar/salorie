import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from './lib/jwt';

// Auth gate basée sur un JWT cookie (login/register custom + MongoDB).
// Remplace l'ancien HTTP Basic Auth. Edge-safe (jose uniquement, pas de mongoose).
const PUBLIC = ['/login', '/register'];

// L'espace personnel /me a son PROPRE gardien — Clerk, cote navigateur, avec la meme
// instance que l'app mobile. Le laisser tomber dans le portail par jeton d'admin
// renverrait chaque utilisateur vers /login, une page d'administration qu'il n'a
// aucune raison de voir et ou son compte Salorie ne fonctionne pas. Les deux
// systemes d'authentification cohabitent donc sans se croiser : jeton Mongo pour le
// back-office, Clerk + Firebase pour les utilisateurs.
const ESPACE_PERSONNEL = '/me';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === ESPACE_PERSONNEL || pathname.startsWith(ESPACE_PERSONNEL + '/')) {
    return NextResponse.next();
  }
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
