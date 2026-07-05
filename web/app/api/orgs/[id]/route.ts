import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.salistar.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// GET = membres de l'org.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await fetch(`${API}/orgs/admin/${params.id}/members`, { headers: headers(), cache: 'no-store' });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}

// POST = créer une invitation (role/email/coachUserId dans le body).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const r = await fetch(`${API}/orgs/admin/${params.id}/invite`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await fetch(`${API}/orgs/admin/${params.id}`, { method: 'DELETE', headers: headers() });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
