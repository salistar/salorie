import { NextRequest, NextResponse } from 'next/server';
import { trouverCompte } from '../../../../lib/adminAuth';
import { authAdmin } from '../../../../lib/firebaseAdmin';
import { signToken, AUTH_COOKIE } from '../../../../lib/jwt';

export const runtime = 'nodejs';

// Connexion Google au back-office.
// ---------------------------------------------------------------------------
// LA CHAINE DE CONFIANCE, ETAPE PAR ETAPE
//
//   1. Le navigateur se connecte a Clerk avec Google.
//   2. Clerk est echange contre un jeton personnalise Firebase (le pont qui
//      existait deja pour /me).
//   3. Le navigateur envoie ICI le jeton d'identite Firebase.
//   4. `verifyIdToken` en verifie la SIGNATURE : on ne croit pas le client sur
//      parole, on verifie cryptographiquement que Google puis Firebase ont bien
//      atteste cette adresse.
//   5. L'adresse doit exister dans la table des admins. Sinon : 403.
//
// ⚠ AUCUN COMPTE N'EST CREE ICI. Une adresse Google inconnue est refusee, point.
// Si cette route creait un compte, n'importe qui avec une adresse Gmail
// deviendrait administrateur — c'est l'erreur classique des ponts SSO.
//
// ⚠ `verifyIdToken` avec `checkRevoked` : une session revoquee cote Firebase ne
// doit pas pouvoir ouvrir une session admin de sept jours.

const ATTEMPTS = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 10;
function tooMany(key: string): boolean {
  const now = Date.now();
  const e = ATTEMPTS.get(key);
  if (!e || now > e.reset) { ATTEMPTS.set(key, { n: 1, reset: now + WINDOW_MS }); return false; }
  e.n += 1;
  return e.n > MAX_TRIES;
}

export async function POST(req: NextRequest) {
  let jeton: unknown;
  try {
    ({ jeton } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Requête illisible' }, { status: 400 });
  }
  if (typeof jeton !== 'string' || !jeton) {
    return NextResponse.json({ ok: false, error: 'Jeton absent' }, { status: 400 });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    return NextResponse.json({ ok: false, error: 'Trop de tentatives — réessaie dans 15 min.' }, { status: 429 });
  }

  let email = '';
  try {
    const decode = await authAdmin().verifyIdToken(jeton, true);
    email = String(decode.email || '').toLowerCase().trim();
    // Une adresse non verifiee par le fournisseur ne prouve rien : certains
    // fournisseurs laissent declarer une adresse qu'on ne possede pas.
    if (!email || decode.email_verified === false) {
      return NextResponse.json({ ok: false, error: 'Adresse non vérifiée' }, { status: 403 });
    }
  } catch (e: any) {
    console.error('[auth/google] jeton refusé', e?.message || e);
    return NextResponse.json({ ok: false, error: 'Jeton invalide ou expiré' }, { status: 401 });
  }

  try {
    const compte = await trouverCompte(email);
    if (!compte) {
      // Message volontairement explicite : la personne EST authentifiee, elle
      // n'est simplement pas administratrice. Lui repondre « identifiants
      // invalides » l'enverrait chercher une faute de frappe inexistante.
      console.warn('[auth/google] refus — non administrateur :', email);
      return NextResponse.json(
        { ok: false, error: "Ce compte Google n'est pas un compte du back-office." },
        { status: 403 },
      );
    }

    const token = await signToken(email, compte.role, compte.scopes);
    const res = NextResponse.json({ ok: true, email, role: compte.role });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: true,
    });
    return res;
  } catch (e: any) {
    // Meme lecon que /api/auth/login : un AUTH_SECRET absent leve APRES la
    // verification, et renvoyer 400 ferait chercher une erreur de saisie alors
    // que le serveur est mal configure.
    console.error('[auth/google]', e);
    const cle = String(e?.message || '').includes('AUTH_SECRET');
    return NextResponse.json(
      { ok: false, error: cle ? 'Configuration serveur incomplète (AUTH_SECRET).' : 'Erreur serveur' },
      { status: 500 },
    );
  }
}
