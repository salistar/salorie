// ⚠ `params` EST UNE PROMESSE DEPUIS NEXT 15.
// La signature synchrone ne leve AUCUNE erreur de type — elle est
// structurellement valide — mais `params.id` vaut alors `undefined` a
// l'execution, et la requete part vers une URL trouee.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../../lib/adminGuard';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// GET = membres de l'org.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const r = await fetch(`${API}/orgs/admin/${id}/members`, { headers: headers(), cache: 'no-store' });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}

// POST = créer une invitation (role/email/coachUserId dans le body).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const body = await req.json().catch(() => ({}));
    const r = await fetch(`${API}/orgs/admin/${id}/invite`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const r = await fetch(`${API}/orgs/admin/${id}`, { method: 'DELETE', headers: headers() });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
