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
  // Le corps illisible est la SEULE faute imputable au client ici. On l'isole pour
  // que le catch global n'ait plus à couvrir deux cas opposés.
  let email: unknown, password: unknown;
  try {
    ({ email, password } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Requête illisible' }, { status: 400 });
  }

  try {
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
    // Ne pas fuiter les détails internes (mongoose/bcrypt/jwt) au client — mais dire
    // la vérité sur QUI a échoué. Cette route renvoyait 400 : le navigateur affichait
    // donc une erreur de saisie alors que le serveur était en panne. Un AUTH_SECRET
    // absent fait lever signToken APRÈS validation du mot de passe : le BON mot de
    // passe produisait un 400 et le mauvais un 401. Trois jours de connexions
    // impossibles avant que la cause soit vue, le 4 août 2026.
    console.error('[auth/login]', e);
    const cle = String(e?.message || '').includes('AUTH_SECRET');
    return NextResponse.json(
      { ok: false, error: cle ? 'Configuration serveur incomplète (AUTH_SECRET).' : 'Erreur serveur' },
      { status: 500 },
    );
  }
}
