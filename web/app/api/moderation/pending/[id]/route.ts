// ⚠ `params` EST UNE PROMESSE DEPUIS NEXT 15.
// La signature synchrone ne leve AUCUNE erreur de type — elle est
// structurellement valide — mais `params.id` vaut alors `undefined` a
// l'execution, et la requete part vers une URL trouee.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../../../lib/adminGuard';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// POST /api/moderation/pending/:id?action=validate|reject
// Valide ou rejette un produit inconnu (barcode) en attente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  const action = req.nextUrl.searchParams.get('action') === 'reject' ? 'reject' : 'validate';
  let body: any = {};
  try { body = await req.json(); } catch { /* corps optionnel */ }
  try {
    const r = await fetch(`${API}/barcode/admin/pending/${id}/${action}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {}),
    });
    return NextResponse.json(await r.json().catch(() => ({ ok: r.ok })), { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 502 });
  }
}
