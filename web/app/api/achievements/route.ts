import { NextRequest, NextResponse } from 'next/server';
import { getAchievements, setAchievements } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return NextResponse.json(await getAchievements()); }
  catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 500 }); }
}

// POST { list } → écrit toute la liste dans Firestore config/achievements.
export async function POST(req: NextRequest) {
  try {
    const { list } = await req.json();
    if (!Array.isArray(list)) return NextResponse.json({ error: 'list requise' }, { status: 400 });
    // garde-fou : clés + metric valides
    const ok = list.filter((a: any) => a && a.key && ['streak', 'daysTracked', 'weighIns', 'totalLogs'].includes(a.metric));
    await setAchievements(ok);
    return NextResponse.json({ ok: true, count: ok.length });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 500 }); }
}
