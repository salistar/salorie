// @couleurs-identite
// ---------------------------------------------------------------------------
// Ce fichier porte des couleurs qui NE SUIVENT PAS le theme, et ne doivent
// jamais etre converties en jetons.
//
// Le marqueur ci-dessus n'est pas decoratif : les outils de migration le
// LISENT et sautent le fichier. Un simple commentaire en francais ne protege
// rien — ce fichier a ete abime trois fois avant que ce marqueur existe.
// Echelle A->E : un degrade continu du vert au rouge. La rendre thematique
// n en teinterait que trois paliers sur cinq, et casserait la progression.

// Score santé ON-DEVICE (hors-ligne) d'un produit — Nutri-Score simplifié calculé
// localement à partir des nutriments /100g. Utilisé par le scan code-barres ET le
// scan d'étiquette. Aucun réseau, aucun appel IA : pur calcul déterministe.
//
// Algorithme (inspiré Nutri-Score ANSES, solides) :
//   points négatifs (0-10) : énergie, sucres, graisses saturées, sodium
//   points positifs (0-5)  : fibres, protéines
//   note = négatifs - positifs  →  grade A..E
// Si seules les macros de base sont connues (étiquette OCR : kcal/prot/gluc/lip),
// on bascule sur une heuristique approchée et on le signale (approx=true).

export type Nutriments = {
  kcal?: number; protein?: number; carbs?: number; fat?: number;
  sugars?: number; satFat?: number; salt?: number; sodium?: number; fiber?: number;
};
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
export type HealthScore = {
  grade: Grade;
  score: number;        // 0-100 (100 = meilleur)
  verdict: 'good' | 'ok' | 'bad';
  color: string;
  approx: boolean;      // true si calculé sans sucres/satFat/sel
};

// ⚠ ECHELLE D'IDENTITE — elle ne suit PAS le theme, et ce module n'a pas a le
// connaitre. A -> E est un degrade continu du vert au rouge, comme le
// Nutri-Score : le rendre thematique casserait la PROGRESSION, puisque seuls
// A, C et E auraient un jeton et B, D resteraient fixes. Et healthScore.ts est
// un module de calcul : y faire entrer le theme melangerait deux domaines.
const GRADE_COLOR: Record<Grade, string> = {
  A: '#16A34A', B: '#65A30D', C: '#D97706', D: '#EA580C', E: '#DC2626',
};

function pts(value: number, thresholds: number[]): number {
  // renvoie l'index (0..N) du premier seuil dépassé
  let p = 0;
  for (const t of thresholds) { if (value > t) p++; else break; }
  return p;
}

export function computeHealthScore(nIn: Nutriments): HealthScore {
  const n = nIn || {};
  const kcal = Number(n.kcal) || 0;
  const protein = Number(n.protein) || 0;
  const carbs = Number(n.carbs) || 0;
  const fat = Number(n.fat) || 0;
  const hasFull = n.sugars != null || n.satFat != null || n.salt != null || n.sodium != null;

  // Sodium en mg : depuis sel (g*400) ou sodium direct (g→mg).
  const sodiumMg = n.sodium != null ? Number(n.sodium) * 1000 : (n.salt != null ? Number(n.salt) * 400 : undefined);
  const sugars = n.sugars != null ? Number(n.sugars) : undefined;
  const satFat = n.satFat != null ? Number(n.satFat) : undefined;
  const fiber = n.fiber != null ? Number(n.fiber) : undefined;

  let negative: number, positive: number, approx: boolean;

  if (hasFull) {
    approx = false;
    const energyKJ = kcal * 4.184;
    const nEnergy = pts(energyKJ, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]);
    const nSugar = pts(sugars ?? 0, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]);
    const nSat = pts(satFat ?? 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const nSod = pts(sodiumMg ?? 0, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
    const pFiber = pts(fiber ?? 0, [0.9, 1.9, 2.8, 3.7, 4.7]);
    const pProt = pts(protein, [1.6, 3.2, 4.8, 6.4, 8]);
    negative = nEnergy + nSugar + nSat + nSod;
    positive = pFiber + pProt;
  } else {
    // Étiquette OCR : seulement kcal/prot/gluc/lip → heuristique approchée.
    approx = true;
    const nEnergy = pts(kcal, [80, 160, 240, 320, 400, 480, 560, 640, 720, 800]); // /100g
    const nCarb = pts(carbs, [10, 20, 30, 40, 50, 60, 65, 70, 75, 80]);            // proxy sucres
    const nFat = pts(fat, [3, 6, 10, 14, 18, 22, 26, 30, 34, 38]);
    const pProt = pts(protein, [3, 6, 9, 12, 15]);
    negative = nEnergy + Math.round(nCarb * 0.6) + nFat;
    positive = pProt;
  }

  const raw = negative - positive; // plus c'est bas, mieux c'est
  const grade: Grade = raw <= -1 ? 'A' : raw <= 2 ? 'B' : raw <= 10 ? 'C' : raw <= 18 ? 'D' : 'E';
  const verdict: HealthScore['verdict'] = grade === 'A' || grade === 'B' ? 'good' : grade === 'C' ? 'ok' : 'bad';
  // score 0-100 : map raw [-15 .. 40] → [100 .. 0]
  const score = Math.max(0, Math.min(100, Math.round(100 - ((raw + 15) / 55) * 100)));
  return { grade, score, verdict, color: GRADE_COLOR[grade], approx };
}

// Libellés trilingues du verdict (à afficher dans l'UI).
export const VERDICT_TXT: Record<string, Record<HealthScore['verdict'], string>> = {
  en: { good: 'Good choice', ok: 'So-so', bad: 'Better avoid' },
  fr: { good: 'Bon produit', ok: 'Moyen', bad: 'À éviter' },
  ar: { good: 'منتج جيد', ok: 'متوسط', bad: 'يُفضّل تجنّبه' },
};
