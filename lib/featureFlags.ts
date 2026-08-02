// Feature Flags (Lot 4 / Étape 3). L'admin écrit des flags dans Firestore
// `config/features` ; l'app les lit au démarrage + masque les features désactivées.
// DÉFAUT = activé : on ne masque QUE si explicitement désactivé → aucune casse si le
// doc est absent / hors-ligne / en erreur. Cache AsyncStorage pour l'offline.
//
// RÉTRO-COMPAT : historiquement `config/features` ne contenait que des BOOLÉENS
// simples (`{ fasting: false }`). On garde ce comportement tel quel, et on
// ÉTEND le schéma vers des flags « riches » (objets) qui portent en plus :
//   - premium   : la feature exige un abonnement Premium (gating locked)
//   - rollout   : déploiement progressif 0..100 (% d'utilisateurs, hash stable)
//   - minVersion: version minimale de l'app requise ('1.2.3')
//   - config    : payload arbitraire lu par l'écran (flagConfig)
// Un flag reste `true` par défaut : on ne renvoie `false` que si explicitement
// désactivé / hors rollout / version trop ancienne.
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/** Flag « riche » : soit un booléen simple (legacy), soit un objet de config. */
export type RichFlag =
  | boolean
  | {
      enabled?: boolean;
      premium?: boolean;
      rollout?: number;       // 0..100 (% d'utilisateurs qui voient la feature)
      minVersion?: string;    // ex. '1.2.3'
      config?: Record<string, any>;
    };

export type FlagMap = Record<string, RichFlag>;

/** Alias legacy conservé pour ne casser aucun import existant. */
export type Flags = FlagMap;

const CACHE = 'feature_flags_v1';
let memo: FlagMap | null = null;

// Base API backend (mêmes flags, mais servis avec cache Redis + repli « dernier bon »
// si Firestore est down/quota-exhausted). Router la lecture par l'API épargne aussi le
// quota Firestore : N clients → 1 lecture backend mise en cache 60 s, au lieu de N lectures.
const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

/** Lit les flags via GET {API}/flags. Renvoie null si l'API est injoignable OU si le
 *  backend n'a PAS pu lire Firestore (source:'empty') → on n'écrase alors pas le cache. */
async function fetchFlagsFromApi(): Promise<FlagMap | null> {
  if (!API_URL) return null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${API_URL}/flags`, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const j: any = await r.json();
    if (j?.source === 'empty') return null; // backend n'a pas pu lire → ne pas faire confiance au vide
    const flags = j?.flags;
    return flags && typeof flags === 'object' ? (flags as FlagMap) : null;
  } catch { return null; }
}

export async function fetchFlags(): Promise<FlagMap> {
  // 1) endpoint backend résilient (cache + lastgood, épargne le quota Firestore).
  const viaApi = await fetchFlagsFromApi();
  if (viaApi) {
    memo = viaApi;
    try { await AsyncStorage.setItem(CACHE, JSON.stringify(viaApi)); } catch {}
    return viaApi;
  }
  // 2) Firestore direct (source de vérité si l'API est injoignable).
  try {
    const snap = await getDoc(doc(db, 'config', 'features'));
    const flags = (snap.exists() ? snap.data() : {}) as FlagMap;
    memo = flags;
    try { await AsyncStorage.setItem(CACHE, JSON.stringify(flags)); } catch {}
    return flags;
  } catch {
    // 3) cache offline (dernier connu).
    try { const raw = await AsyncStorage.getItem(CACHE); if (raw) { memo = JSON.parse(raw); return memo!; } } catch {}
    return memo || {};
  }
}

/** Renvoie l'objet de config d'un flag riche (ou {} pour un flag booléen/absent). */
export function flagConfig(flags: FlagMap | null | undefined, key: string): Record<string, any> {
  const v = flags?.[key];
  if (v && typeof v === 'object' && v.config && typeof v.config === 'object') return v.config;
  return {};
}

/** true si le flag exige explicitement Premium (`{ premium: true }`). */
export function flagRequiresPremium(flags: FlagMap | null | undefined, key: string): boolean {
  const v = flags?.[key];
  return !!(v && typeof v === 'object' && v.premium === true);
}

/**
 * Hash djb2 STABLE (jamais Math.random) sur `userKey:key` → bucket 0..99.
 * Un même utilisateur tombe TOUJOURS dans le même bucket pour un flag donné :
 * le rollout est déterministe et cohérent entre les sessions/écrans.
 */
export function inRollout(userKey: string, key: string, pct: number): boolean {
  // Bornes : <=0 → personne ; >=100 → tout le monde. Pas de userKey → on laisse
  // passer (défaut permissif : on ne masque pas faute d'identité stable).
  if (!(pct > 0)) return false;
  if (pct >= 100) return true;
  if (!userKey) return true;
  const s = `${userKey}:${key}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h % 100) < pct;
}

/**
 * Compare deux versions sémantiques 'a' >= 'b' ('1.2.3'). Tolère des longueurs
 * différentes ('1.2' vs '1.2.0') et des segments non numériques (ignorés → 0).
 */
export function versionGte(a: string, b: string): boolean {
  const parse = (v: string) =>
    String(v || '').split('.').map((n) => {
      const x = parseInt(n, 10);
      return Number.isFinite(x) ? x : 0;
    });
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true; // égales
}

/**
 * Feature activée ? DÉFAUT = true. On ne renvoie `false` QUE si :
 *   - flag booléen explicitement `false`, ou
 *   - flag objet avec `enabled === false`, ou
 *   - hors rollout (rollout est un nombre 0..100 + ctx.userKey fourni), ou
 *   - version de l'app < minVersion (minVersion + ctx.appVersion fournis).
 * Signature rétro-compatible : `ctx` est optionnel (comportement booléen conservé
 * quand on n'en passe pas ; rollout/minVersion ne s'appliquent que si le contexte
 * nécessaire est présent → jamais de masquage surprise).
 */
export function isEnabled(
  flags: FlagMap | null | undefined,
  key: string,
  ctx?: { userKey?: string; appVersion?: string }
): boolean {
  const v = flags?.[key];

  // Flag absent → activé par défaut.
  if (v === undefined || v === null) return true;

  // Flag booléen (legacy) : activé sauf si explicitement false.
  if (typeof v === 'boolean') return v !== false;

  // Flag objet (riche).
  if (typeof v === 'object') {
    if (v.enabled === false) return false;

    // Rollout progressif : appliqué seulement si rollout est un nombre ET qu'on a
    // une clé utilisateur stable (sinon on ne masque pas — défaut permissif).
    if (typeof v.rollout === 'number' && ctx?.userKey) {
      if (!inRollout(ctx.userKey, key, v.rollout)) return false;
    }

    // Version minimale : appliquée seulement si on connaît la version de l'app.
    if (v.minVersion && ctx?.appVersion) {
      if (!versionGte(ctx.appVersion, v.minVersion)) return false;
    }

    return true;
  }

  // Type inattendu → activé par défaut (ne jamais casser).
  return true;
}

export function useFeatureFlags(): FlagMap {
  const [flags, setFlags] = useState<FlagMap>(memo || {});
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const raw = await AsyncStorage.getItem(CACHE); if (raw && alive) setFlags(JSON.parse(raw)); } catch {}
      const fresh = await fetchFlags();
      if (alive) setFlags(fresh);
    })();
    return () => { alive = false; };
  }, []);
  return flags;
}
