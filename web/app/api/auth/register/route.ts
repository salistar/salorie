import { NextRequest, NextResponse } from 'next/server';
import { createUser, countUsers } from '../../../../lib/adminAuth';
import { signToken, AUTH_COOKIE } from '../../../../lib/jwt';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password, setupKey } = await req.json();
    // SÉCURITÉ (fix audit) : l'inscription admin était OUVERTE (n'importe qui pouvait
    // créer un compte admin + recevoir un cookie JWT admin). Désormais autorisée seulement si :
    //  (a) aucun admin n'existe encore → bootstrap du 1er compte, OU
    //  (b) une clé serveur ADMIN_SETUP_KEY valide est fournie dans le body (setupKey).
    // Les connexions des admins existants ne sont PAS affectées.
    const existing = await countUsers();
    if (existing > 0) {
      const expected = process.env.ADMIN_SETUP_KEY;
      if (!expected || setupKey !== expected) {
        return NextResponse.json({ ok: false, error: 'Inscription désactivée' }, { status: 403 });
      }
    }
    await createUser(email, password);
    const token = await signToken(String(email).toLowerCase().trim());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: true,
    });
    return res;
  } catch (e: any) {
    // createUser lève des messages de validation FR volontaires et non sensibles
    // (email déjà pris, mot de passe trop court) qu'on relaie à l'UI. On journalise
    // néanmoins l'erreur brute côté serveur pour le diagnostic sans l'exposer davantage.
    console.error('[auth/register]', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 400 });
  }
}
