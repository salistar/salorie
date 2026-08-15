// Suhoor et Iftar : QUOI manger, pas seulement combien.
// ---------------------------------------------------------------------------
// `lib/ramadan.ts` répartissait déjà le budget (Suhoor ~40 %, Iftar ~60 %) et
// planifiait l'hydratation. L'écran disait donc « ton iftar : 1 200 kcal » — sans
// jamais dire quoi mettre dans l'assiette. Ce module comble exactement cet écart,
// en puisant dans les 653 plats de `assets/data/local-foods.json`.
//
// DÉTERMINISTE, sans IA. Trois raisons : la même journée doit donner la même
// suggestion (une proposition qui change à chaque ouverture n'inspire pas
// confiance) ; ça fonctionne hors-ligne, or le Ramadan se vit souvent en famille
// loin du wifi ; et ça se teste.
//
// Ce que la base permet et ne permet pas : elle donne le nom (FR et AR) et les
// macros pour 100 g. PAS de fibres, PAS d'index glycémique, PAS de catégorie. La
// satiété est donc APPROCHÉE par la densité protéique — c'est le meilleur signal
// disponible, et le commentaire de `indiceSatiete` en dit les limites.

export type Aliment = { n: string; ar?: string; k: number; p: number; c: number; f: number };

export type Portion = {
  aliment: Aliment;
  grammes: number;
  kcal: number;
  p: number;
  c: number;
  f: number;
};

export type Assiette = {
  portions: Portion[];
  kcal: number;
  p: number;
  c: number;
  f: number;
};

// Portions réalistes. Une fourchette UNIQUE ne pouvait pas convenir : les tests ont
// montré qu'un plancher de 60 g transformait « trois dattes » en 166 kcal, et qu'un
// plafond de 400 g empêchait un plat peu dense d'atteindre son budget — un suhoor
// tombait à 292 kcal au lieu de 700, ce qui laisserait quelqu'un affamé toute la
// journée. Chaque RÔLE a donc ses bornes.
type Bornes = { min: number; max: number };
const PLAT: Bornes = { min: 60, max: 450 };
/** Les dattes se comptent en unités : une datte pèse ~7 g. */
const ACCOMPAGNEMENT_LEGER: Bornes = { min: 15, max: 60 };

/**
 * Indice de satiété, 0-1.
 *
 * Fondé sur la densité protéique (protéines par kcal) : c'est le facteur le mieux
 * établi de la satiété à calories égales, et le seul que cette base permette de
 * calculer. Un aliment très dense en énergie est légèrement pénalisé — à quantité
 * égale, il rassasie moins longtemps qu'un aliment plus volumineux.
 *
 * Ce n'est PAS un indice de satiété validé cliniquement (ceux-là demandent fibres
 * et index glycémique, absents ici). Il sert à ORDONNER des plats entre eux, pas à
 * prétendre à une mesure.
 */
export function indiceSatiete(a: Aliment): number {
  const kcal = Math.max(1, Number(a.k) || 0);
  const densiteProteique = Math.min(1, ((Number(a.p) || 0) * 4) / kcal / 0.4);
  // 250 kcal/100 g est une densité déjà élevée pour un plat cuisiné.
  const penaliteDensite = Math.min(1, kcal / 250) * 0.25;
  return Math.max(0, Math.min(1, densiteProteique - penaliteDensite));
}

/** Normalise pour la recherche par nom (accents, casse). */
const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Premier aliment dont le nom correspond, ou `null`. */
function trouver(base: Aliment[], motif: RegExp): Aliment | null {
  return base.find((a) => motif.test(norm(a.n))) || null;
}

/** Portion calculée pour atteindre un nombre de kcal, bornée au réalisme. */
function portionPour(aliment: Aliment, kcalVoulues: number, bornes: Bornes = PLAT): Portion {
  const parGramme = (Number(aliment.k) || 0) / 100;
  const brut = parGramme > 0 ? kcalVoulues / parGramme : bornes.min;
  const grammes = Math.round(Math.max(bornes.min, Math.min(bornes.max, brut)) / 5) * 5;
  const f = grammes / 100;
  return {
    aliment,
    grammes,
    kcal: Math.round((Number(aliment.k) || 0) * f),
    p: Math.round((Number(aliment.p) || 0) * f * 10) / 10,
    c: Math.round((Number(aliment.c) || 0) * f * 10) / 10,
    f: Math.round((Number(aliment.f) || 0) * f * 10) / 10,
  };
}

function totaliser(portions: Portion[]): Assiette {
  return {
    portions,
    kcal: portions.reduce((s, p) => s + p.kcal, 0),
    p: Math.round(portions.reduce((s, p) => s + p.p, 0) * 10) / 10,
    c: Math.round(portions.reduce((s, p) => s + p.c, 0) * 10) / 10,
    f: Math.round(portions.reduce((s, p) => s + p.f, 0) * 10) / 10,
  };
}

/**
 * Choix stable : même jour + même budget = même suggestion.
 *
 * On ne prend pas systématiquement le meilleur plat, sinon tout le monde mange le
 * même tajine pendant trente jours. On tire dans les meilleurs candidats à partir
 * d'une graine dérivée de la date — la variété sans le hasard.
 */
function choisirStable<T>(candidats: T[], graine: number, largeur = 5): T | null {
  if (!candidats.length) return null;
  const n = Math.min(largeur, candidats.length);
  return candidats[Math.abs(graine) % n];
}

/** Graine journalière : `YYYY-MM-DD` → entier. */
export function graineDuJour(date: string): number {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return h;
}

/**
 * SUHOOR — le repas d'avant l'aube. Objectif : tenir la journée.
 *
 * On privilégie la satiété : un plat protéique en pièce maîtresse, complété d'un
 * apport glucidique pour l'énergie longue. Le café est délibérément absent des
 * suggestions — diurétique avant une journée sans boire.
 */
export function suggererSuhoor(base: Aliment[], kcalBudget: number, date: string): Assiette {
  const budget = Math.max(0, Math.round(kcalBudget));
  if (!base.length || budget <= 0) return totaliser([]);

  const graine = graineDuJour(date);
  // On ne retient que les plats dont une portion SERVABLE couvre la part visée.
  // Sans ce filtre, le plus rassasiant de la base pouvait etre un aliment tres peu
  // dense : 450 g n'en fournissaient pas la moitie du budget, et l'assiette
  // arrivait tres en dessous sans que rien ne le signale.
  const partPrincipale = budget * 0.65;
  const assezDense = (a: Aliment) => ((Number(a.k) || 0) / 100) * PLAT.max >= partPrincipale;
  const rassasiants = [...base]
    .filter((a) => (Number(a.k) || 0) > 40 && assezDense(a))
    .sort((x, y) => indiceSatiete(y) - indiceSatiete(x));

  const principal = choisirStable(rassasiants, graine);
  if (!principal) return totaliser([]);

  // Deux tiers du budget sur la pièce maîtresse, un tiers sur l'accompagnement :
  // un suhoor tout protéique passe mal à 4 h du matin et ne tient pas l'après-midi.
  const portions: Portion[] = [portionPour(principal, partPrincipale)];

  const glucidiques = base
    .filter((a) => (Number(a.c) || 0) * 4 > (Number(a.k) || 1) * 0.5 && a.n !== principal.n)
    .sort((x, y) => indiceSatiete(y) - indiceSatiete(x));
  const reste = Math.max(0, budget - portions[0].kcal);
  const accompagnement = choisirStable(
    glucidiques.filter((a) => ((Number(a.k) || 0) / 100) * PLAT.max >= reste * 0.6),
    graine >> 3,
  ) || choisirStable(glucidiques, graine >> 3);
  if (accompagnement && reste > 40) portions.push(portionPour(accompagnement, reste));

  return totaliser(portions);
}

/**
 * IFTAR — la rupture du jeûne. Objectif : recharger sans écœurer.
 *
 * On suit l'ordre traditionnel, qui se trouve être aussi le plus sage
 * physiologiquement : des dattes pour remonter la glycémie en douceur, une soupe
 * pour réhydrater et préparer l'estomac, puis le plat principal. Se jeter
 * directement sur un plat riche après quinze heures de jeûne est ce qui provoque
 * les lourdeurs du soir.
 */
export function suggererIftar(base: Aliment[], kcalBudget: number, date: string): Assiette {
  const budget = Math.max(0, Math.round(kcalBudget));
  if (!base.length || budget <= 0) return totaliser([]);

  const graine = graineDuJour(date);
  const portions: Portion[] = [];

  const dattes = trouver(base, /\bdattes?\b/);
  if (dattes) {
    // Trois dattes, la mesure traditionnelle — pas un calcul, un usage.
    portions.push(portionPour(dattes, Math.min(70, budget * 0.06), ACCOMPAGNEMENT_LEGER));
  }

  const soupe = trouver(base, /harira|chorba|soupe/);
  if (soupe) portions.push(portionPour(soupe, budget * 0.2));

  const dejaPris = portions.reduce((s, p) => s + p.kcal, 0);
  const reste = Math.max(0, budget - dejaPris);
  if (reste > 80) {
    // Meme filtre de faisabilite que pour le suhoor : un plat peu dense plafonne a
    // 450 g et laisserait l'iftar tres en dessous du budget, sans rien signaler.
    const servable = (a: Aliment) => ((Number(a.k) || 0) / 100) * PLAT.max >= reste;
    const candidats = base.filter(
      (a) => (Number(a.p) || 0) >= 8 && !portions.some((p) => p.aliment.n === a.n),
    );
    const plats = (candidats.filter(servable).length ? candidats.filter(servable) : candidats)
      .sort((x, y) => indiceSatiete(y) - indiceSatiete(x));
    const principal = choisirStable(plats, graine >> 5);
    if (principal) portions.push(portionPour(principal, reste));
  }

  return totaliser(portions);
}

/** Nom dans la langue de l'utilisateur (la base porte les deux). */
export function nomAliment(a: Aliment, langue = 'fr'): string {
  return langue === 'ar' && a.ar ? a.ar : a.n;
}
