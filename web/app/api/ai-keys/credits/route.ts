import { NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../../lib/adminGuard';
import { LLM_PROVIDERS, db } from '../../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Crédits / validité des clés LLM.
 *
 * Constat du 6 août 2026, mesuré fournisseur par fournisseur : sur les neuf providers,
 * DEUX SEULEMENT exposent un solde interrogeable (DeepSeek et Moonshot). Pour les autres,
 * afficher « crédit inconnu » serait inutile — on interroge donc un endpoint gratuit
 * (liste de modèles) pour distinguer ce qui compte vraiment en exploitation : une clé
 * VIVANTE d'une clé morte ou révoquée.
 *
 * Deux pièges vérifiés en direct, à ne pas « corriger » :
 *  - Moonshot ne répond QUE sur api.moonshot.ai ; api.moonshot.cn renvoie
 *    « Invalid Authentication » avec une clé pourtant valide.
 *  - une clé OpenAI `sk-admin-…` est une clé d'ADMINISTRATION : /v1/models renvoie 403
 *    alors que /v1/organization/projects renvoie 200. Elle ne peut PAS appeler un modèle.
 *    On le signale explicitement, sinon le palier OpenAI échoue en silence à l'exécution.
 */

type Etat = {
  key: string;
  label: string;
  configuree: boolean;
  valide: boolean | null;      // null = non testable
  solde: string | null;        // devise incluse, ex. « 4.77 USD »
  detail: string;
};

const TIMEOUT_MS = 12_000;

async function req(url: string, init: RequestInit = {}): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Sonde de VALIDITÉ : un GET gratuit qui ne consomme aucun jeton. */
async function valide(url: string, headers: Record<string, string>): Promise<boolean | null> {
  const r = await req(url, { headers });
  if (!r) return null;                 // réseau/timeout : on ne conclut pas
  return r.status >= 200 && r.status < 300;
}

async function sonder(key: string, label: string, valeur: string): Promise<Etat> {
  const base: Etat = { key, label, configuree: !!valeur, valide: null, solde: null, detail: '' };
  if (!valeur) return { ...base, detail: 'non configurée' };

  try {
    switch (key) {
      case 'DEEPSEEK_API_KEY': {
        const r = await req('https://api.deepseek.com/user/balance', {
          headers: { Authorization: `Bearer ${valeur}` },
        });
        if (!r) return { ...base, detail: 'injoignable' };
        if (!r.ok) return { ...base, valide: false, detail: `refusée (HTTP ${r.status})` };
        const j: any = await r.json();
        const b = j?.balance_infos?.[0];
        return {
          ...base, valide: true,
          solde: b ? `${b.total_balance} ${b.currency}` : null,
          detail: j?.is_available ? 'compte actif' : 'compte indisponible',
        };
      }
      case 'MOONSHOT_API_KEY': {
        // .ai (international) — PAS .cn, cf. entête de fichier.
        const r = await req('https://api.moonshot.ai/v1/users/me/balance', {
          headers: { Authorization: `Bearer ${valeur}` },
        });
        if (!r) return { ...base, detail: 'injoignable' };
        if (!r.ok) return { ...base, valide: false, detail: `refusée (HTTP ${r.status})` };
        const j: any = await r.json();
        const d = j?.data;
        return {
          ...base, valide: true,
          solde: d ? `${Number(d.available_balance).toFixed(2)} USD` : null,
          detail: d ? `dont ${Number(d.voucher_balance).toFixed(2)} en bons` : '',
        };
      }
      case 'OPENAI_API_KEY': {
        const r = await req('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${valeur}` },
        });
        if (!r) return { ...base, detail: 'injoignable' };
        if (r.ok) return { ...base, valide: true, detail: 'clé de projet — OK' };
        // 401/403 sur /v1/models + 200 sur l'API admin = clé d'administration.
        const adm = await req('https://api.openai.com/v1/organization/projects', {
          headers: { Authorization: `Bearer ${valeur}` },
        });
        if (adm?.ok) {
          return {
            ...base, valide: false,
            detail: "clé d'ADMINISTRATION (sk-admin-…) : ne peut pas appeler de modèle — il faut une clé de projet sk-proj-…",
          };
        }
        return { ...base, valide: false, detail: `refusée (HTTP ${r.status})` };
      }
      case 'ANTHROPIC_API_KEY':
        return {
          ...base,
          valide: await valide('https://api.anthropic.com/v1/models', {
            'x-api-key': valeur, 'anthropic-version': '2023-06-01',
          }),
          detail: 'pas d’API de solde chez Anthropic',
        };
      case 'GEMINI_API_KEY':
        return {
          ...base,
          valide: await valide(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(valeur)}`, {}),
          detail: 'solde visible seulement dans Google AI Studio',
        };
      case 'XAI_API_KEY': {
        const r = await req('https://api.x.ai/v1/api-key', { headers: { Authorization: `Bearer ${valeur}` } });
        if (!r) return { ...base, detail: 'injoignable' };
        if (!r.ok) return { ...base, valide: false, detail: `refusée (HTTP ${r.status})` };
        const j: any = await r.json();
        return { ...base, valide: true, detail: j?.name ? `compte « ${j.name} »` : 'clé valide' };
      }
      case 'ZHIPU_API_KEY':
        return {
          ...base,
          valide: await valide('https://open.bigmodel.cn/api/paas/v4/models', { Authorization: `Bearer ${valeur}` }),
          detail: 'solde sur la console ZhipuAI',
        };
      case 'DASHSCOPE_API_KEY':
        return {
          ...base,
          valide: await valide('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', {
            Authorization: `Bearer ${valeur}`,
          }),
          detail: 'si refusée : la clé peut exiger une URL de base privée (espace de travail)',
        };
      default:
        return { ...base, detail: 'pas de sonde connue pour ce provider' };
    }
  } catch (e: any) {
    return { ...base, detail: e?.message || 'erreur' };
  }
}

export async function GET() {
  const a = await requireAdmin(); if (!a) return unauthorized();
  try {
    const d = await db().collection('secrets').doc('llm_keys').get();
    const data: any = (d.exists ? d.data() : {}) || {};
    // En parallèle : neuf appels séquentiels prendraient plus d'une minute.
    const etats = await Promise.all(
      LLM_PROVIDERS.map((p) => sonder(p.key, p.label, String(data[p.key] || '')))
    );
    return NextResponse.json({ etats, verifieLe: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erreur' }, { status: 500 });
  }
}
