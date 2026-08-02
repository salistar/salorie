import { NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
const headers = () => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
};

export async function GET() {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const r = await fetch(`${API}/news/admin`, { headers: headers(), cache: 'no-store' });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'backend injoignable' }, { status: 502 }); }
}
export async function POST(req: Request) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const r = await fetch(`${API}/news/admin`, { method: 'POST', headers: headers(), body: JSON.stringify(await req.json()) });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
export async function PUT(req: Request) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const { id, ...dto } = await req.json();
    const r = await fetch(`${API}/news/admin/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(dto) });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
export async function DELETE(req: Request) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const { id } = await req.json();
    const r = await fetch(`${API}/news/admin/${id}`, { method: 'DELETE', headers: headers() });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
