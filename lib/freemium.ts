// Freemium — limiteur d'usage GRATUIT par feature, avec reset quotidien (AsyncStorage).
// Levier de conversion : au-delà du quota gratuit, on présente le paywall RevenueCat.
// Premium = AUCUNE limite. Défaut permissif, jamais throw. Les quotas peuvent être
// surchargés à chaud via un flag `freemium` (params) — voir readOverrides().
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ymd } from './format';

// Quotas gratuits par jour (0 ou absent = illimité). Généreux pour ne pas gêner le
// casual, mais convertit les power-users. Modifiable via flag sans redéploiement.
export const FREE_LIMITS: Record<string, number> = {
  scan: 3,
  'ai-coach': 5,
  'ai-meal-plan': 1,
};

const key = (feature: string, day: string) => `free_usage:${feature}:${day}`;

export async function getUsage(feature: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key(feature, ymd(new Date())));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Limite gratuite pour une feature (0 = illimité). `overrides` = params d'un flag. */
export function freeLimit(feature: string, overrides?: Record<string, number> | null): number {
  const o = overrides && typeof overrides[feature] === 'number' ? overrides[feature] : undefined;
  return o != null ? o : (FREE_LIMITS[feature] ?? 0);
}

/** Reste-t-il des usages gratuits ? Premium → toujours true. Limite ≤ 0 → illimité. */
export async function canUseFree(feature: string, isPremium: boolean, overrides?: Record<string, number> | null): Promise<boolean> {
  if (isPremium) return true;
  const limit = freeLimit(feature, overrides);
  if (limit <= 0) return true;
  const used = await getUsage(feature);
  return used < limit;
}

/** Incrémente le compteur du jour (à appeler QUAND l'action gratuite est consommée). */
export async function consume(feature: string): Promise<void> {
  try {
    const k = key(feature, ymd(new Date()));
    const used = await getUsage(feature);
    await AsyncStorage.setItem(k, String(used + 1));
  } catch {
    /* best-effort : ne jamais bloquer l'action pour un souci de compteur */
  }
}

/** Usages gratuits restants aujourd'hui (pour l'UI). Premium/illimité → Infinity. */
export async function remainingFree(feature: string, isPremium: boolean, overrides?: Record<string, number> | null): Promise<number> {
  if (isPremium) return Infinity;
  const limit = freeLimit(feature, overrides);
  if (limit <= 0) return Infinity;
  const used = await getUsage(feature);
  return Math.max(0, limit - used);
}
