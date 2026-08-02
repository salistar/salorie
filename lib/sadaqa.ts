import AsyncStorage from '@react-native-async-storage/async-storage';

// Sadaqa Jariya — convertit l'effort cumulé (km) en impact caritatif traçable.
// Équivalent MENA des « arbres plantés » de The Conqueror.
//
// Règles simples et documentées (faciles à ajuster côté produit) :
//   - 1 repas distribué pour chaque tranche de 20 km parcourus.
//   - 1 arganier planté pour chaque tranche de 50 km parcourus.
// L'impact est tronqué vers le bas (on ne « débloque » un palier qu'une fois atteint).
export const KM_PER_MEAL = 20;
export const KM_PER_TREE = 50;

// Clé AsyncStorage facultative : si l'app écrit les km cumulés ici, on les lit.
export const RACE_TOTAL_KM_KEY = 'race_total_km';

export interface SadaqaImpact {
  meals: number;
  trees: number;
}

/**
 * Calcule l'impact caritatif à partir des km cumulés.
 * @param totalKm distance cumulée (km). Valeurs négatives / NaN traitées comme 0.
 */
export function computeSadaqa(totalKm: number): SadaqaImpact {
  const km = Number.isFinite(totalKm) && totalKm > 0 ? totalKm : 0;
  return {
    meals: Math.floor(km / KM_PER_MEAL),
    trees: Math.floor(km / KM_PER_TREE),
  };
}

/**
 * Lit les km cumulés depuis AsyncStorage (clé `race_total_km`) si elle existe,
 * sinon retourne la valeur de repli fournie (0 par défaut).
 */
export async function getTotalKm(fallback = 0): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(RACE_TOTAL_KM_KEY);
    if (raw != null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    // Stockage indisponible — on retombe sur le fallback.
  }
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/**
 * Distance (km) restante avant le prochain repas et le prochain arganier,
 * + fraction de progression [0..1] vers chacun de ces paliers.
 */
export function nextMilestones(totalKm: number) {
  const km = Number.isFinite(totalKm) && totalKm > 0 ? totalKm : 0;
  const mealProgress = (km % KM_PER_MEAL) / KM_PER_MEAL;
  const treeProgress = (km % KM_PER_TREE) / KM_PER_TREE;
  return {
    kmToNextMeal: KM_PER_MEAL - (km % KM_PER_MEAL),
    kmToNextTree: KM_PER_TREE - (km % KM_PER_TREE),
    mealProgress, // 0..1
    treeProgress, // 0..1
  };
}
