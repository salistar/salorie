import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/adminGuard';

export const runtime = 'nodejs';
// Jamais mise en cache : deux comptes n'ont pas les memes droits, et servir la
// session de l'un a l'autre donnerait un menu faux — voire un menu trop large.
export const dynamic = 'force-dynamic';

/**
 * Identite de la session courante, pour que la barre laterale (composant client)
 * n'affiche que les sections autorisees.
 *
 * On la sert par une route plutot qu'en lisant le cookie dans le layout : cette
 * lecture rendrait TOUTES les pages du back-office dynamiques, alors qu'une bonne
 * moitie est aujourd'hui pregeneree. Aucune donnee sensible ici — l'email du
 * compte, son role et ses perimetres, que son porteur connait deja.
 */
export async function GET() {
  const u = await requireAdmin();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, email: u.email, role: u.role, scopes: u.scopes });
}
