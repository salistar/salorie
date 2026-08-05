// Defense-in-depth : chaque route API admin re-vérifie le cookie JWT elle-même,
// au lieu de dépendre UNIQUEMENT du middleware Edge (point de défaillance unique).
// Next 14 -> cookies() synchrone ; verifyToken (jose) asynchrone.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE, type Role } from './jwt';

export async function requireAdmin(): Promise<{ email: string; role: Role } | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return token ? await verifyToken(token) : null;
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

export function forbidden(raison = 'Droits insuffisants') {
  // 403 et non 401 : l'identité est établie, c'est le droit qui manque. Renvoyer 401
  // ferait croire au client que la session a expiré et déclencherait une reconnexion
  // inutile.
  return NextResponse.json({ ok: false, error: raison }, { status: 403 });
}

/**
 * Identité + droit d'ÉCRIRE.
 *
 * Jusqu'ici tout compte pouvait tout faire — c'était le principal reproche de l'audit
 * de sécurité du back-office. Un `viewer` peut désormais consulter sans pouvoir
 * modifier : c'est le rôle qu'on donne à un stagiaire, à un modérateur en formation,
 * ou à quiconque doit regarder sans risque.
 *
 * Rend soit l'utilisateur, soit la RÉPONSE à retourner tel quel — l'appelant ne peut
 * donc pas oublier de traiter le refus : il n'a pas accès à `user` sans avoir vérifié.
 */
export async function requireWriter(): Promise<
  { user: { email: string; role: Role }; refus?: undefined } | { user?: undefined; refus: NextResponse }
> {
  const u = await requireAdmin();
  if (!u) return { refus: unauthorized() };
  if (u.role === 'viewer') return { refus: forbidden('Compte en lecture seule') };
  return { user: u };
}
