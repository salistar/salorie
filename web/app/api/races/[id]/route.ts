import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized, requireWriter } from '../../../../lib/adminGuard';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const r = await fetch(`${API}/races/admin/${params.id}`, { method: 'DELETE', headers: headers() });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}

// POST = déclenche la génération des médailles (classement) pour la course.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user: _admin, refus } = await requireWriter(); if (refus) return refus;
  try {
    const r = await fetch(`${API}/races/admin/${params.id}/generate-medals`, { method: 'POST', headers: headers() });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
