import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../lib/adminGuard';
import { listPremiumUsers, setPremiumOverride } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET → liste des users avec leur champ premiumOverride.
export async function GET() {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try { return NextResponse.json(await listPremiumUsers()); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 }); }
}

// POST { userId, value:boolean } → écrit users/{userId}.premiumOverride + audit.
export async function POST(req: NextRequest) {
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  const actor = req.headers.get('x-admin-actor') || _admin.email || 'admin';
  try {
    const { userId, value } = await req.json();
    if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    await setPremiumOverride(userId, !!value, actor);
    return NextResponse.json({ ok: true, userId, value: !!value });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
