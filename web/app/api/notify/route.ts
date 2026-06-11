import { NextRequest, NextResponse } from 'next/server';
import { getPushTargets } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

// POST { title, message, userIds? } → envoie une notif push (Expo) à tous les users
// ou à une liste. Protégé par le middleware (cookie JWT admin).
export async function POST(req: NextRequest) {
  try {
    const { title, message, userIds } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message requis' }, { status: 400 });
    }
    const specific = Array.isArray(userIds) && userIds.length ? userIds : undefined;
    const targets = await getPushTargets(specific);
    if (!targets.length) {
      return NextResponse.json({ ok: true, sent: 0, total: 0, note: 'Aucun token push trouvé (les users doivent avoir ouvert l\'app + accepté les notifs).' });
    }
    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < targets.length; i += 100) {
      const batch = targets.slice(i, i + 100).map((t) => ({
        to: t.token, title: title || 'Salorie', body: message, sound: 'default',
      }));
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(batch),
        });
        if (res.ok) sent += batch.length; else errors.push(`HTTP ${res.status}`);
      } catch (e: any) { errors.push(e?.message || 'fetch'); }
    }
    return NextResponse.json({ ok: true, sent, total: targets.length, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
