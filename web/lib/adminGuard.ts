// Defense-in-depth : chaque route API admin re-vérifie le cookie JWT elle-même,
// au lieu de dépendre UNIQUEMENT du middleware Edge (point de défaillance unique).
// Next 14 -> cookies() synchrone ; verifyToken (jose) asynchrone.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from './jwt';

export async function requireAdmin(): Promise<{ email: string } | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return token ? await verifyToken(token) : null;
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}
