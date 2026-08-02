import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';
import admin from 'firebase-admin';
import { db, getPushTargets, getFcmTargets, listUsers } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

// POST { title, message, userIds? }
// → 1) Livraison IN-APP : écrit la notif dans users/{id}/notifications_history
//      (la cloche 🔔 de l'app la lit) — fonctionne SANS FCM, tout de suite.
//   2) Push Expo (best-effort) pour les users ayant un token — nécessite FCM configuré.
// Protégé par le middleware (cookie JWT admin).
export async function POST(req: NextRequest) {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const { title, message, userIds } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message requis' }, { status: 400 });
    }
    const specific = Array.isArray(userIds) && userIds.length ? userIds : undefined;

    // ── 1) IN-APP (cloche) — marche sans FCM ──────────────────────────────────
    const targetIds = specific || (await listUsers(2000)).map((u) => u.id);
    const nowIso = new Date().toISOString();
    let inApp = 0;
    for (const id of targetIds) {
      try {
        await db().collection('users').doc(id).collection('notifications_history').add({
          title: title || 'Salorie',
          body: message,
          data: { kind: 'admin' },
          source: 'admin',
          receivedAt: nowIso,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        inApp++;
      } catch { /* skip user */ }
    }

    // ── 2) PUSH SYSTÈME via FCM DIRECT (firebase-admin) — bannière, sans Expo/EAS ──
    const fcm = await getFcmTargets(specific);
    let fcmSent = 0;
    const fcmErrors: string[] = [];
    if (fcm.length) {
      const messaging = admin.messaging();
      for (let i = 0; i < fcm.length; i += 500) {
        const tokens = fcm.slice(i, i + 500).map((x) => x.token);
        try {
          const resp = await messaging.sendEachForMulticast({
            tokens,
            notification: { title: title || 'Salorie', body: message },
            data: { kind: 'admin' },
            android: { priority: 'high', notification: { sound: 'default', channelId: 'default' } },
          });
          fcmSent += resp.successCount;
          resp.responses.forEach((r) => { if (!r.success && r.error) fcmErrors.push(r.error.code); });
        } catch (e: any) { fcmErrors.push(e?.message || 'fcm'); }
      }
    }

    // ── 3) PUSH Expo (best-effort, si des users ont un token Expo) ─────────────
    const targets = await getPushTargets(specific);
    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < targets.length; i += 100) {
      const batch = targets.slice(i, i + 100).map((t) => ({
        to: t.token, title: title || 'Salorie', body: message, sound: 'default', data: { kind: 'admin' },
      }));
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        if (res.ok) sent += batch.length; else errors.push(`HTTP ${res.status}`);
      } catch (e: any) { errors.push(e?.message || 'fetch'); }
    }

    return NextResponse.json({
      ok: true,
      inApp,                 // notifs déposées dans la cloche (livraison garantie)
      fcmSent,               // push système FCM envoyés (bannière)
      fcmTargets: fcm.length,
      pushSent: sent,        // push Expo (secondaire, si tokens Expo présents)
      pushTargets: targets.length,
      total: targetIds.length,
      fcmErrors,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
