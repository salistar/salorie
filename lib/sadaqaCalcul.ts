// Sadaqa Jariya — la partie CALCUL, sans aucune dependance.
// ---------------------------------------------------------------------------
// Extrait de `lib/sadaqa.ts`, qui importe AsyncStorage et n'est donc pas
// utilisable depuis un navigateur. Le calcul, lui, est pur : le sortir ici
// permet au web de l'IMPORTER au lieu de le recopier.
//
// C'est important pour cet ecran precisement : il annonce a quelqu'un combien
// de repas son effort a finance. Deux clients qui annoncent des chiffres
// differents pour les memes kilometres detruiraient la credibilite des deux.

// Sadaqa Jariya — convertit l'effort cumulé (km) en impact caritatif traçable.
// Équivalent MENA des « arbres plantés » de The Conqueror.
//
// Règles simples et documentées (faciles à ajuster côté produit) :
//   - 1 repas distribué pour chaque tranche de 20 km parcourus.
//   - 1 arganier planté pour chaque tranche de 50 km parcourus.
// L'impact est tronqué vers le bas (on ne « débloque » un palier qu'une fois atteint).
export const KM_PER_MEAL = 20;
export const KM_PER_TREE = 50;

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
