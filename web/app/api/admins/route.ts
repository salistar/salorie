import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '../../../lib/adminGuard';
import {
  createUser,
  listerComptes,
  modifierCompte,
  supprimerCompte,
} from '../../../lib/adminAuth';
import type { Role, Scope } from '../../../lib/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Gouvernance des comptes du back-office. Chaque verbe repasse par
// `requireSuperadmin` : c'est la seule surface qui permet d'elargir des droits, elle
// ne doit dependre d'aucun controle situe ailleurs.

const ROLES: Role[] = ['owner', 'admin', 'viewer'];

export async function GET() {
  const { user, refus } = await requireSuperadmin();
  if (!user) return refus;
  return NextResponse.json({ ok: true, comptes: await listerComptes() });
}

export async function POST(req: NextRequest) {
  const { user, refus } = await requireSuperadmin();
  if (!user) return refus;
  try {
    const { email, password, role, scopes } = await req.json();
    if (!ROLES.includes(role)) return NextResponse.json({ ok: false, error: 'Rôle inconnu' }, { status: 400 });
    await createUser(String(email || ''), String(password || ''), role as Role, (scopes || []) as Scope[]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { user, refus } = await requireSuperadmin();
  if (!user) return refus;
  try {
    const { email, role, scopes } = await req.json();
    if (role && !ROLES.includes(role)) {
      return NextResponse.json({ ok: false, error: 'Rôle inconnu' }, { status: 400 });
    }
    // Se retirer a soi-meme le super-admin, c'est perdre l'acces a cette page dans la
    // seconde. `modifierCompte` protege deja le DERNIER super-admin ; ici on protege
    // l'operateur contre sa propre main quand il en reste d'autres.
    if (email && String(email).toLowerCase().trim() === user.email && role && role !== 'owner') {
      return NextResponse.json(
        { ok: false, error: 'Tu ne peux pas retirer ton propre statut de super-admin' },
        { status: 400 },
      );
    }
    await modifierCompte(String(email || ''), { role: role as Role, scopes: scopes as Scope[] });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, refus } = await requireSuperadmin();
  if (!user) return refus;
  try {
    const { email } = await req.json();
    if (String(email || '').toLowerCase().trim() === user.email) {
      return NextResponse.json({ ok: false, error: 'Tu ne peux pas supprimer ton propre compte' }, { status: 400 });
    }
    await supprimerCompte(String(email || ''));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 400 });
  }
}
