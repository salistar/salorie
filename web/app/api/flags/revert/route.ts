import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../../lib/adminGuard';
import { revertFlag } from '../../../../lib/flagsAdmin';

export const runtime = 'nodejs';

// POST { id } → restaure la valeur `before` d'une entrée d'audit (flag ou premium).
export async function POST(req: NextRequest) {
  const { user: admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const { id } = await req.json();
    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    const r = await revertFlag(id, admin.email);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
