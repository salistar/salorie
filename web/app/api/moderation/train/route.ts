import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../../lib/adminGuard';
import { db } from '../../../../lib/mongo';

export const runtime = 'nodejs';
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// POST /api/moderation/train — enregistre une DEMANDE d'entraînement du modèle
// (boucle active-learning). L'exécution réelle du script sur srv3 reste MANUELLE :
// on persiste un flag/record que l'opérateur consulte, et on notifie le backend au
// mieux (best-effort). La réponse confirme « demande enregistrée ».
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (!admin) return unauthorized();

  let body: any = {};
  try { body = await req.json(); } catch { /* corps optionnel */ }

  const record = {
    type: 'training_request',
    requestedBy: admin.email,
    requestedAt: new Date(),
    status: 'pending',
    note: body?.note || null,
  };

  // 1) Persiste le flag/record dans Mongo (source de vérité pour l'opérateur srv3).
  let persisted = false;
  try {
    const conn = (await db()).connection;
    await conn.collection('ml_training_requests').insertOne(record);
    persisted = true;
  } catch {
    persisted = false;
  }

  // 2) Best-effort : prévient le backend (ignore l'échec, l'exécution est manuelle).
  try {
    await fetch(`${API}/ml/feedback/train-request`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(record),
    });
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    persisted,
    message: 'Demande enregistrée. L’entraînement sera lancé manuellement sur srv3.',
  });
}
