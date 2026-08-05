import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../lib/adminGuard';
import {
  getPendingSportFields,
  getRecentSportMatches,
  approveSportField,
  rejectSportField,
} from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET = terrains en attente (approved==false) + matchs récents, lus dans Firestore.
export async function GET() {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const [fields, matches] = await Promise.all([
      getPendingSportFields(),
      getRecentSportMatches(),
    ]);
    return NextResponse.json({ fields, matches });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Firestore injoignable' }, { status: 500 });
  }
}

// POST { id, action: 'approve' | 'reject' } → écrit directement dans Firestore admin.
export async function POST(req: NextRequest) {
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const { id, action } = await req.json();
    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    if (action === 'approve') { await approveSportField(id); return NextResponse.json({ ok: true, id, approved: true }); }
    if (action === 'reject') { await rejectSportField(id); return NextResponse.json({ ok: true, id, rejected: true }); }
    return NextResponse.json({ error: 'action invalide (approve|reject)' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
