// Substitutions — quelle priorité guide le classement des alternatives.
// ---------------------------------------------------------------------------
// Extrait du `substitutions.tsx` mobile, à l'identique, et isolé ici parce que
// c'est la partie de l'écran qui peut donner un MAUVAIS conseil de santé.
//
// L'ordre des tests n'est pas décoratif : l'hypertension passe avant le diabète,
// qui passe avant la perte de poids. Quelqu'un d'hypertendu ET en perte de poids
// doit voir ses alternatives classées par le SEL, pas par les calories — sinon
// l'écran lui recommande en premier un produit moins calorique et plus salé,
// c'est-à-dire exactement ce qu'il doit éviter.

export type Priorite = 'sel' | 'sucre' | 'calories' | null;

export interface ContexteSante {
  conditions?: string[];
  goal?: string;
}

/**
 * Priorité déduite du profil. PURE.
 *
 * Renvoie `null` quand rien ne s'applique : un classement neutre vaut mieux
 * qu'un classement inventé.
 */
export function prioriteSubstitution(ctx: ContexteSante | null | undefined): Priorite {
  if (!ctx) return null;
  const cond = Array.isArray(ctx.conditions) ? ctx.conditions : [];
  if (cond.includes('hypertension')) return 'sel';
  if (cond.includes('diabetes')) return 'sucre';
  if (ctx.goal === 'lose') return 'calories';
  return null;
}

/** Phrase ajoutée à la consigne IA. Reprend mot pour mot celle du mobile, pour
 *  que les deux clients obtiennent des réponses comparables. */
export function consignePriorite(p: Priorite): string {
  switch (p) {
    case 'sel':
      return " L'utilisateur suit un objectif « moins de sel » (tension). Classe les alternatives de la meilleure (moins salée) à la moins bonne, la 1re étant le meilleur choix.";
    case 'sucre':
      return " L'utilisateur suit un objectif « moins de sucre » (glycémie). Classe les alternatives de la meilleure (moins sucrée) à la moins bonne, la 1re étant le meilleur choix.";
    case 'calories':
      return " L'utilisateur vise une perte de poids : privilégie « moins de calories ». Classe les alternatives de la meilleure (moins calorique) à la moins bonne, la 1re étant le meilleur choix.";
    default:
      return '';
  }
}

/** Consigne complète envoyée au backend, aliment compris. */
export function consigneSubstitution(aliment: string, p: Priorite): string {
  const nom = aliment.trim().slice(0, 80);
  return (
    `Donne 3 alternatives plus saines et/ou moins caloriques à "${nom}". ` +
    `Pour chaque alternative : le nom, pourquoi c'est mieux (1 phrase courte), ` +
    `et l'économie de calories approximative. Réponds en français, concis, format liste.` +
    consignePriorite(p)
  );
}
