import { NextRequest, NextResponse } from 'next/server';
import { setFlag } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

// POST { key, value } → écrit le flag dans Firestore config/features.
// Protégé par le middleware (cookie JWT admin).
export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    if (typeof key !== 'string') return NextResponse.json({ error: 'key requis' }, { status: 400 });
    await setFlag(key, !!value);
    return NextResponse.json({ ok: true, key, value: !!value });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
