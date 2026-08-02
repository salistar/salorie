import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../../../lib/adminGuard';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// POST /api/moderation/pending/:id?action=validate|reject
// Valide ou rejette un produit inconnu (barcode) en attente.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  const action = req.nextUrl.searchParams.get('action') === 'reject' ? 'reject' : 'validate';
  let body: any = {};
  try { body = await req.json(); } catch { /* corps optionnel */ }
  try {
    const r = await fetch(`${API}/barcode/admin/pending/${params.id}/${action}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {}),
    });
    return NextResponse.json(await r.json().catch(() => ({ ok: r.ok })), { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 502 });
  }
}
