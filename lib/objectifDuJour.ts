// Objectif calorique DU JOUR, modulé par la forme.
// ---------------------------------------------------------------------------
// Le score de récupération (`lib/readiness.ts`) existait mais restait décoratif :
// il s'affichait, et rien n'en découlait. Ce module en fait une décision — c'est
// la différence entre un chiffre et une fonctionnalité.
//
// TROIS GARDE-FOUS, dans l'ordre de gravité :
//
//  1. On n'écrit JAMAIS dans `nutritionalPlan.dailyCalories`. Cet objectif-là est
//     la référence, calculée sur des semaines de données. Ce module produit une
//     SUGGESTION pour aujourd'hui ; demain repart de la base. Laisser une humeur
//     d'un matin réécrire la référence ferait dériver l'objectif sans que personne
//     ne comprenne pourquoi.
//
//  2. L'écart est borné à ±10 %. Au-delà, ce n'est plus un ajustement, c'est un
//     autre régime — et une app n'a pas à décider cela sur la foi d'une nuit.
//
//  3. Un PLANCHER absolu : jamais de suggestion sous 1 200 kcal, quel que soit le
//     calcul. En dessous, on ne parle plus de récupération mais de restriction, et
//     aucune fatigue passagère ne justifie qu'un logiciel y pousse quelqu'un.

/** Plancher de sécurité. Aucune suggestion ne descend en dessous. */
export const PLANCHER_KCAL = 1200;

/** Amplitude maximale de l'ajustement, en fraction de l'objectif de référence. */
export const AMPLITUDE_MAX = 0.1;

export type ObjectifJour = {
  /** Calories suggérées pour aujourd'hui. */
  kcal: number;
  /** Écart en kcal par rapport à la référence (négatif = moins). */
  delta: number;
  /** Clé de raison, traduite à l'affichage. */
  raison: 'repos' | 'menagement' | 'normal' | 'pleine-forme' | 'plancher';
};

/**
 * @param baseKcal  Objectif de référence (`nutritionalPlan.dailyCalories`).
 * @param score     Score de récupération 0-100 (`computeReadiness`).
 * @param objectif  Objectif de l'utilisateur — une personne en perte de poids ne
 *                  doit pas se voir proposer un surplus les jours de grande forme.
 */
export function objectifDuJour(
  baseKcal: number,
  score: number | null | undefined,
  objectif?: string,
): ObjectifJour {
  const base = Math.round(Number(baseKcal) || 0);
  // Sans référence utilisable, on ne suggère rien : mieux vaut ne rien dire que
  // d'inventer un objectif.
  if (base <= 0) return { kcal: 0, delta: 0, raison: 'normal' };

  // `null` et `undefined` doivent signifier « on ne sait pas », pas « score zéro ».
  // Le test l'a montré : `Number(null)` vaut 0, donc un utilisateur SANS donnée de
  // sommeil se voyait traité comme épuisé et recevait +10 % sans aucune raison.
  if (score == null) return { kcal: base, delta: 0, raison: 'normal' };
  const s = Number(score);
  if (!Number.isFinite(s)) return { kcal: base, delta: 0, raison: 'normal' };

  let fraction = 0;
  let raison: ObjectifJour['raison'] = 'normal';

  if (s < 40) {
    // Forme basse : le corps répare, et réparer coûte de l'énergie. On desserre
    // légèrement plutôt que d'ajouter une restriction à une fatigue.
    fraction = AMPLITUDE_MAX;
    raison = 'repos';
  } else if (s < 60) {
    fraction = AMPLITUDE_MAX / 2;
    raison = 'menagement';
  } else if (s >= 85) {
    // Grande forme : la journée supportera un déficit un peu plus net — mais
    // SEULEMENT si la personne cherche à perdre du poids. Proposer un déficit à
    // quelqu'un qui veut prendre du muscle irait contre son objectif.
    const perteDePoids = /lose|perdre|perte|weight_loss/i.test(String(objectif || ''));
    if (perteDePoids) {
      fraction = -AMPLITUDE_MAX / 2;
      raison = 'pleine-forme';
    }
  }

  let kcal = Math.round(base * (1 + fraction));

  // Le plancher prime sur tout le reste, y compris sur une réduction demandée.
  if (kcal < PLANCHER_KCAL) {
    kcal = Math.max(PLANCHER_KCAL, Math.min(base, PLANCHER_KCAL));
    return { kcal, delta: kcal - base, raison: 'plancher' };
  }

  return { kcal, delta: kcal - base, raison: fraction === 0 ? 'normal' : raison };
}

const TEXTES: Record<string, Record<ObjectifJour['raison'], string>> = {
  fr: {
    repos: 'Ta forme est basse : un peu plus d’énergie aujourd’hui, le temps de récupérer.',
    menagement: 'Récupération moyenne : on desserre légèrement l’objectif du jour.',
    normal: 'Objectif habituel : ta forme est dans la moyenne.',
    'pleine-forme': 'Belle forme aujourd’hui : la journée supporte un objectif un peu plus serré.',
    plancher: 'Objectif maintenu au minimum de sécurité.',
  },
  en: {
    repos: 'Your recovery is low: a little more energy today while you recover.',
    menagement: 'Average recovery: today’s target is eased slightly.',
    normal: 'Usual target: your recovery is average.',
    'pleine-forme': 'Great shape today: the day can take a slightly tighter target.',
    plancher: 'Target kept at the safety minimum.',
  },
  ar: {
    repos: 'تعافيك منخفض: طاقة أكبر قليلًا اليوم ريثما تستعيد قوتك.',
    menagement: 'تعافٍ متوسط: يُخفَّف هدف اليوم قليلًا.',
    normal: 'الهدف المعتاد: تعافيك في المتوسط.',
    'pleine-forme': 'حالتك ممتازة اليوم: يمكن للهدف أن يكون أضيق قليلًا.',
    plancher: 'أُبقي الهدف عند الحد الأدنى الآمن.',
  },
};

export function expliquerObjectifDuJour(o: ObjectifJour, langue = 'fr'): string {
  return (TEXTES[langue] || TEXTES.fr)[o.raison];
}
