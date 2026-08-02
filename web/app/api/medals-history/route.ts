import { NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';

export async function GET() {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const h: Record<string, string> = {};
    if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
    const r = await fetch(`${API}/races/admin/medals`, { headers: h, cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ error: `backend ${r.status}` }, { status: r.status });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'backend injoignable' }, { status: 502 }); }
}
