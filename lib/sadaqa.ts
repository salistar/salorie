import AsyncStorage from '@react-native-async-storage/async-storage';

// Le CALCUL vit desormais dans `sadaqaCalcul.ts`, sans dependance, pour que le
// web l'importe au lieu de le recopier. Ce fichier garde la lecture du stockage
// et reexporte le reste : aucun appelant n'a besoin de changer.
export {
  KM_PER_MEAL,
  KM_PER_TREE,
  computeSadaqa,
  nextMilestones,
  type SadaqaImpact,
} from './sadaqaCalcul';

// Clé AsyncStorage : si l'app écrit les km cumulés ici, on les lit.
export const RACE_TOTAL_KM_KEY = 'race_total_km';

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
