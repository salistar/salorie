import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';
import { LLM_PROVIDERS, getLLMKeysStatus, setLLMKeys } from '../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET → liste des providers + statut (masqué, jamais la valeur en clair).
export async function GET() {
  const a = await requireAdmin(); if (!a) return unauthorized();
  try {
    return NextResponse.json({ providers: LLM_PROVIDERS, status: await getLLMKeysStatus() });
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 }); }
}

// POST { keys: { ANTHROPIC_API_KEY: '…', … } } → enregistre dans secrets/llm_keys.
export async function POST(req: NextRequest) {
  const a = await requireAdmin(); if (!a) return unauthorized();
  const actor = req.headers.get('x-admin-actor') || a.email || 'admin';
  try {
    const body = await req.json();
    const keys = (body && typeof body.keys === 'object' && body.keys) || {};
    await setLLMKeys(keys as Record<string, string>, actor);
    return NextResponse.json({ ok: true, status: await getLLMKeysStatus() });
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 }); }
}
