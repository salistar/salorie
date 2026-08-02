import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';
import { setFlag, setFlagRich } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

// POST accepte DEUX formes de payload :
//   - legacy : { key, value:boolean }        → setFlag (toggle simple)
//   - riche  : { key, patch:{ enabled?, premium?, rollout?, minVersion?, config? } } → setFlagRich
// Protégé par le middleware (cookie JWT admin) + re-check requireAdmin.
export async function POST(req: NextRequest) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  // actor : header explicite sinon email de l'admin authentifié sinon 'admin'.
  const actor = req.headers.get('x-admin-actor') || _admin.email || 'admin';
  try {
    const body = await req.json();
    const key = body?.key;
    if (typeof key !== 'string') return NextResponse.json({ error: 'key requis' }, { status: 400 });

    if (body && body.patch && typeof body.patch === 'object') {
      const p = body.patch;
      const patch = {
        ...(p.enabled !== undefined ? { enabled: !!p.enabled } : {}),
        ...(p.premium !== undefined ? { premium: !!p.premium } : {}),
        ...(typeof p.rollout === 'number' ? { rollout: p.rollout } : {}),
        ...(typeof p.minVersion === 'string' ? { minVersion: p.minVersion } : {}),
        ...(p.config !== undefined ? { config: p.config } : {}),
      };
      await setFlagRich(key, patch, actor);
      return NextResponse.json({ ok: true, key, patch });
    }

    // legacy
    const value = !!body?.value;
    await setFlag(key, value);
    return NextResponse.json({ ok: true, key, value });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
