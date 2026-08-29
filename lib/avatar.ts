// Avatar RPG évolutif — système d'XP/niveaux 100% LOCAL (AsyncStorage).
// L'XP s'accumule à partir de l'activité de l'utilisateur (repas loggés, km, etc.).
// addXp(n) est branché plus tard par les écrans d'activité ; cet module ne fait
// QUE stocker/lire l'XP et dériver le niveau — aucune dépendance backend.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'avatar_v1';

// --- Courbe de niveaux -------------------------------------------------------
// Choix : niveau = floor(sqrt(xp / 100)) + 1.
//   niveau 1 => 0 XP
//   niveau 2 => 100 XP   (1² * 100)
//   niveau 3 => 400 XP   (2² * 100)
//   niveau 4 => 900 XP   (3² * 100)
//   niveau N => (N-1)² * 100 XP
// Courbe quadratique simple : douce au début, l'effort grandit avec le niveau.
const XP_FACTOR = 100;

/** XP cumulée nécessaire pour ATTEINDRE un niveau donné (>=1). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (n - 1) * (n - 1) * XP_FACTOR;
}

/** Niveau correspondant à une XP cumulée. */
export function levelForXp(xp: number): number {
  const safe = Math.max(0, xp || 0);
  return Math.floor(Math.sqrt(safe / XP_FACTOR)) + 1;
}

// --- Titres par palier (clés trilingues, résolues côté écran) ----------------
// Chaque palier débloque un titre + un équipement à partir d'un niveau minimum.
export type Tier = {
  minLevel: number;
  /** clé de titre — l'écran fournit la map { en, fr, ar }. */
  titleKey: string;
  /** clé d'équipement débloqué à ce palier. */
  gearKey: string;
  /** couleur du cercle de niveau pour ce palier. */
  color: string;
};

// ⚠ ECHELLE D'IDENTITE — NE PAS THEMATISER.
// Les paliers d'avatar forment une progression : gris, vert, bleu, violet,
// ambre, rouge, magenta. Les convertir en jetons rendrait plusieurs paliers
// identiques (deux d'entre eux tomberaient sur ) et la progression
// cesserait de se lire. Un palier doit se reconnaitre en Rose comme en Dore,
// exactement comme la couleur d'une ceinture.
export const TIERS: Tier[] = [
  { minLevel: 1, titleKey: 'rookie', gearKey: 'sneakers', color: '#94A3B8' },
  { minLevel: 3, titleKey: 'walker', gearKey: 'water_bottle', color: '#10B981' },
  { minLevel: 5, titleKey: 'runner', gearKey: 'headband', color: '#0EA5E9' },
  { minLevel: 8, titleKey: 'athlete', gearKey: 'smartwatch', color: '#8B5CF6' },
  { minLevel: 12, titleKey: 'warrior', gearKey: 'medal_bronze', color: '#F59E0B' },
  { minLevel: 16, titleKey: 'champion', gearKey: 'medal_silver', color: '#EF4444' },
  { minLevel: 20, titleKey: 'legend', gearKey: 'crown', color: '#D946EF' },
];

/** Le palier (titre + couleur) actif pour un niveau donné. */
export function tierForLevel(level: number): Tier {
  let current = TIERS[0];
  for (const t of TIERS) {
    if (level >= t.minLevel) current = t;
  }
  return current;
}

export type AvatarState = {
  /** XP cumulée brute. */
  xp: number;
  /** niveau actuel (>=1). */
  level: number;
  /** clé de titre du palier actuel (à résoudre via une map trilingue). */
  title: string;
  /** clé d'équipement du palier actuel. */
  gear: string;
  /** couleur du cercle de niveau. */
  color: string;
  /** XP cumulée du niveau actuel (seuil bas de la barre). */
  levelStartXp: number;
  /** XP cumulée pour atteindre le niveau suivant (seuil haut de la barre). */
  nextLevelXp: number;
  /** progression 0..1 dans le niveau actuel. */
  progress: number;
  /** XP restante avant le niveau suivant. */
  xpToNext: number;
};

function deriveState(xp: number): AvatarState {
  const safeXp = Math.max(0, Math.round(xp || 0));
  const level = levelForXp(safeXp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - levelStartXp);
  const progress = Math.min(1, Math.max(0, (safeXp - levelStartXp) / span));
  const tier = tierForLevel(level);
  return {
    xp: safeXp,
    level,
    title: tier.titleKey,
    gear: tier.gearKey,
    color: tier.color,
    levelStartXp,
    nextLevelXp,
    progress,
    xpToNext: Math.max(0, nextLevelXp - safeXp),
  };
}

async function readXp(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Math.max(0, Number(parsed?.xp) || 0);
  } catch {
    return 0;
  }
}

/** Lit l'avatar dérivé de l'XP stockée localement. */
export async function getAvatar(): Promise<AvatarState> {
  const xp = await readXp();
  return deriveState(xp);
}

/**
 * Ajoute n XP (n>0) et renvoie le nouvel état dérivé.
 * À câbler plus tard par les activités/km (ex: addXp(10) par repas loggé,
 * addXp(km * 5), etc.). Sans effet si n <= 0.
 */
export async function addXp(n: number): Promise<AvatarState> {
  const inc = Math.max(0, Math.round(n || 0));
  const current = await readXp();
  const next = current + inc;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ xp: next }));
  } catch {
    // best-effort : si l'écriture échoue, on renvoie quand même l'état attendu.
  }
  return deriveState(next);
}

/** Remet l'XP à zéro (utile pour tests/dev). */
export async function resetAvatar(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ xp: 0 }));
  } catch {}
}
