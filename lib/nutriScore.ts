// @couleurs-identite
// ---------------------------------------------------------------------------
// Ce fichier porte des couleurs qui NE SUIVENT PAS le theme, et ne doivent
// jamais etre converties en jetons.
//
// Le marqueur ci-dessus n'est pas decoratif : les outils de migration le
// LISENT et sautent le fichier. Un simple commentaire en francais ne protege
// rien — ce fichier a ete abime trois fois avant que ce marqueur existe.
// Couleurs officielles du Nutri-Score, publiees par Sante publique France.

// Nutri-Score (algorithme 2017, aliments solides) — calcul simplifié mais fidèle.
// Entrées pour 100 g : énergie (kcal), sucres (g), graisses saturées (g),
// sodium (mg), fibres (g), protéines (g), % fruits/légumes.

export type NutriGrade = 'A' | 'B' | 'C' | 'D' | 'E';

function pts(value: number, table: number[]): number {
  // table = seuils croissants ; renvoie l'index (= points) le plus élevé atteint.
  let p = 0;
  for (let i = 0; i < table.length; i++) if (value > table[i]) p = i + 1;
  return p;
}

export function nutriScore(i: {
  energyKcal: number; sugars: number; satFat: number; sodiumMg: number;
  fiber: number; protein: number; fruitVegPct?: number;
}): { score: number; grade: NutriGrade } {
  const kJ = i.energyKcal * 4.184;
  // Points négatifs (0..10)
  const N =
    pts(kJ, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]) +
    pts(i.sugars, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]) +
    pts(i.satFat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) +
    pts(i.sodiumMg, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
  // Points positifs
  const fv = i.fruitVegPct || 0;
  const fvP = fv > 80 ? 5 : fv > 60 ? 2 : fv > 40 ? 1 : 0;
  const fibP = pts(i.fiber, [0.9, 1.9, 2.8, 3.7, 4.7]);
  const protP = pts(i.protein, [1.6, 3.2, 4.8, 6.4, 8]);
  let P = fvP + fibP;
  // Règle : si N≥11 et fruits/légumes<5pts, les protéines ne comptent pas.
  if (N < 11 || fvP === 5) P += protP;
  const score = N - P;
  const grade: NutriGrade = score <= -1 ? 'A' : score <= 2 ? 'B' : score <= 10 ? 'C' : score <= 18 ? 'D' : 'E';
  return { score, grade };
}

/**
 * ⚠ COULEURS OFFICIELLES DU NUTRI-SCORE — INTOUCHABLES.
 *
 * Ce ne sont pas des couleurs de marque : ce sont celles du logo depose,
 * publiees par Sante publique France. Les remplacer par des jetons de theme
 * afficherait un Nutri-Score qui n'en est plus un — un consommateur reconnait
 * cette echelle a ses teintes exactes, et un vert « du theme » a la place du
 * #038141 officiel serait trompeur.
 *
 * Elles ne suivent donc AUCUN theme, et ne doivent jamais entrer dans la
 * comptabilite des couleurs a migrer.
 */
export const GRADE_COLOR: Record<NutriGrade, string> = {
  A: '#038141', B: '#85BB2F', C: '#FECB02', D: '#EE8100', E: '#E63E11',
};
