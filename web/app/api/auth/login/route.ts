import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '../../../../lib/adminAuth';
import { signToken, AUTH_COOKIE } from '../../../../lib/jwt';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const ok = await verifyUser(String(email || ''), String(password || ''));
    if (!ok) return NextResponse.json({ ok: false, error: 'Identifiants invalides' }, { status: 401 });
    const token = await signToken(String(email).toLowerCase().trim());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7, secure: true,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 400 });
  }
}
