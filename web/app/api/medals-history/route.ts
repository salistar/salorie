import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.BACKEND_URL || 'https://api.salorie.salistar.com';

export async function GET() {
  try {
    const h: Record<string, string> = {};
    if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
    const r = await fetch(`${API}/races/admin/medals`, { headers: h, cache: 'no-store' });
    return NextResponse.json(await r.json());
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'backend injoignable' }, { status: 502 }); }
}
