import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../lib/adminGuard';
import { getReports, setReportStatus } from '../../../lib/firebaseAdmin';
// Le SDK Firestore admin peut rester bloqué indéfiniment sur un cold-start gRPC
// (déjà observé sur le dashboard). Sans borne, l'appel ne répond jamais et l'UI
// reste en skeleton pour toujours. On borne donc CHAQUE accès Firestore.
import { withTimeout } from '../../../lib/withTimeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?status=pending|all → signalements UGC (lisibles UNIQUEMENT ici : les
// règles Firestore interdisent toute lecture côté client).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(); if (!admin) return unauthorized();
  try {
    const status = req.nextUrl.searchParams.get('status') === 'all' ? 'all' : 'pending';
    const reports = await withTimeout(getReports(status as 'pending' | 'all'), 8000, 'Firestore');
    return NextResponse.json({ reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Firestore injoignable' }, { status: 500 });
  }
}

// POST { id, action: 'resolve' | 'dismiss' } → clôt un signalement.
export async function POST(req: NextRequest) {
  const { user: admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const { id, action } = await req.json();
    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    if (action !== 'resolve' && action !== 'dismiss') {
      return NextResponse.json({ error: 'action invalide (resolve|dismiss)' }, { status: 400 });
    }
    await withTimeout(
      setReportStatus(id, action === 'resolve' ? 'resolved' : 'dismissed', admin.email),
      8000, 'Firestore',
    );
    return NextResponse.json({ ok: true, id, status: action });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
