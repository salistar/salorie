import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '../../../../lib/adminAuth';
import { signToken, AUTH_COOKIE } from '../../../../lib/jwt';

export const runtime = 'nodejs';

// Anti-bruteforce (in-memory, par instance) : 5 tentatives / 15 min par (IP+email).
const ATTEMPTS = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;
function tooMany(key: string): boolean {
  const now = Date.now();
  const e = ATTEMPTS.get(key);
  if (!e || now > e.reset) { ATTEMPTS.set(key, { n: 1, reset: now + WINDOW_MS }); return false; }
  e.n += 1;
  return e.n > MAX_TRIES;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const key = ip + ':' + String(email || '').toLowerCase().trim();
    if (tooMany(key)) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives — réessaie dans 15 min.' }, { status: 429 });
    }
    const ok = await verifyUser(String(email || ''), String(password || ''));
    if (!ok) return NextResponse.json({ ok: false, error: 'Identifiants invalides' }, { status: 401 });
    ATTEMPTS.delete(key); // succès -> compteur remis à zéro
    const token = await signToken(String(email).toLowerCase().trim());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: true,
    });
    return res;
  } catch (e: any) {
    // Ne pas fuiter les détails internes (mongoose/bcrypt/parse) au client.
    console.error('[auth/login]', e);
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 400 });
  }
}
