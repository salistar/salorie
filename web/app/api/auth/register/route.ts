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
      // Deux situations bien differentes, et un seul message les confondait :
      // « aucune cle n'est configuree sur le serveur » n'appelle pas la meme
      // action que « ta cle est fausse ». Le premier cas se corrige en posant
      // ADMIN_SETUP_KEY dans l'environnement ; le second en relisant la cle.
      // Aucun des deux messages ne revele quoi que ce soit : ils disent seulement
      // quelle porte essayer.
      if (!expected) {
        return NextResponse.json(
          { ok: false, error: "Inscription fermée : aucune clé d'installation n'est configurée sur le serveur (ADMIN_SETUP_KEY)." },
          { status: 403 },
        );
      }
      if (setupKey !== expected) {
        return NextResponse.json(
          { ok: false, error: "Clé d'installation incorrecte." },
          { status: 403 },
        );
      }
    }
    // Le tout premier compte — ou celui cree avec la cle d'installation — est owner.
    await createUser(email, password, 'owner');
    const token = await signToken(String(email).toLowerCase().trim(), 'owner');
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
