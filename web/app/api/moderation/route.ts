import { NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxy server-to-server vers le backend NestJS (modération).
// Même pattern que api/races : garde la clé admin côté serveur, évite le CORS.
const API = process.env.BACKEND_URL || 'https://api.salorie.com';
function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;
  return h;
}

// GET = agrège les produits inconnus en attente + les stats du dataset d'active-learning.
export async function GET() {
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const [pRes, sRes] = await Promise.all([
      fetch(`${API}/barcode/admin/pending`, { headers: headers(), cache: 'no-store' }),
      fetch(`${API}/ml/feedback/stats`, { headers: headers(), cache: 'no-store' }),
    ]);
    const pending = pRes.ok ? await pRes.json().catch(() => []) : [];
    const stats = sRes.ok ? await sRes.json().catch(() => ({})) : {};
    return NextResponse.json({
      pending: Array.isArray(pending) ? pending : (pending?.items || []),
      stats,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'backend injoignable' }, { status: 502 });
  }
}
