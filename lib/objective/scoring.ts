// Scoring PUR d'un aliment vs l'objectif du jour — PORT FIDÈLE de
// backend/src/objective/scoring.service.ts en TypeScript pur (AUCUN appel réseau).
//
// scoreFood est une fonction pure, testable et robuste :
//  - blocage DUR sur allergies (match tag/nom) et halal (porc si régime halal) ;
//  - adéquation au remainingKcal : on vise ~1/3 du budget restant (1/2 si goal='gain') ;
//  - bonus protéines (lose/maintain) ;
//  - malus densité calorique (lose) ;
//  - verdict great / ok / avoid.
//
// Tout contexte manquant retombe sur des défauts sûrs (jamais d'exception).
// Les `reasons` sont en français court (le composant peut les afficher tel quel
// ou les mapper sur des clés i18n s'il le souhaite).

/** Contexte d'objectif du jour, fourni par l'app (jamais persisté ici). */
export interface ObjectiveContext {
  /** Identifiant user optionnel. */
  uid?: string;
  /** Objectif global : perte / maintien / prise. */
  goal: 'lose' | 'maintain' | 'gain';
  /** Dépense énergétique totale estimée (kcal/jour). */
  tdee: number;
  /** Cible calorique du jour (kcal). */
  dailyKcalTarget: number;
  /** Calories encore disponibles aujourd'hui (kcal). */
  remainingKcal: number;
  /** Cibles macro du jour (grammes). */
  macroTargets: { protein: number; carbs: number; fat: number };
  /** Macros encore disponibles aujourd'hui (grammes). */
  remainingMacros: { protein: number; carbs: number; fat: number };
  /** Régimes suivis (ex: 'halal', 'vegetarian', 'keto', ...). */
  diet: string[];
  /** Allergies (ex: 'peanut', 'gluten', 'lactose', ...). */
  allergies: string[];
  /** Aliments non désirés (préférences). */
  dislikes: string[];
  /**
   * Conditions médicales déclarées (guidance diététique conservatrice, PAS un
   * diagnostic). Valeurs gérées :
   *   'diabetes', 'hypertension', 'high_cholesterol', 'celiac',
   *   'kidney', 'ibs' | 'lowfodmap', 'gout'.
   * Chaque condition applique une pénalité de fit + une reason claire ;
   * 'celiac' (gluten) est un blocage DUR. Toute contrainte médicale ajoute
   * une reason "à confirmer avec ton médecin".
   */
  conditions: string[];
}

/** Un aliment candidat à scorer (par portion). */
export interface FoodCandidate {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Étiquettes libres normalisées (ex: 'pork', 'peanut', 'highP', 'fried'). */
  tags?: string[];
}

/** Verdict de scoring d'un aliment vs l'objectif courant. */
export interface FoodScore {
  /** Score d'adéquation 0..100 (100 = parfait pour l'objectif). */
  fit: number;
  /** Verdict synthétique. */
  verdict: 'great' | 'ok' | 'avoid';
  /** Raisons lisibles (français) expliquant le score. */
  reasons: string[];
  /** Vrai si bloqué dur (allergie / interdiction alimentaire). */
  blocked?: boolean;
}

/** Normalise une chaîne pour comparaison (minuscule, sans accents, trim). */
function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Liste de chaînes normalisées non vides à partir d'une valeur quelconque. */
function normList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => norm(x)).filter(Boolean);
}

/** Nombre fini, sinon défaut. */
function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/** Échappe une chaîne pour insertion littérale dans une RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Familles/synonymes d'allergènes alignés sur offTags : un allergène déclaré
 * (clé) attrape aussi ses synonymes/aliments porteurs (valeurs) via un match à
 * FRONTIÈRE DE MOT. Clés/valeurs normalisées (minuscule, sans accents).
 * PORT FIDÈLE de ScoringService.ALLERGEN_SYNONYMS (backend).
 */
const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  lactose: ['lait', 'fromage', 'beurre', 'creme', 'milk', 'dairy'],
  lait: ['lactose', 'fromage', 'beurre', 'creme', 'milk', 'dairy'],
  arachide: ['peanut', 'cacahuete', 'arachide'],
  peanut: ['arachide', 'cacahuete', 'peanut'],
  cacahuete: ['arachide', 'peanut', 'cacahuete'],
  gluten: ['ble', 'wheat', 'orge', 'seigle', 'barley', 'rye', 'gluten'],
  ble: ['gluten', 'wheat', 'orge', 'seigle'],
  wheat: ['gluten', 'ble', 'orge', 'seigle'],
  noix: ['nut', 'amande', 'noisette', 'noix'],
  nuts: ['noix', 'amande', 'noisette', 'nut'],
  nut: ['noix', 'amande', 'noisette', 'nut'],
};

/**
 * Vrai si l'allergène `a` (déclaré) est présent dans `hay` par un match à
 * FRONTIÈRE DE MOT (RegExp `\ba`), sur l'allergène ET ses synonymes/familles.
 * Évite 'egg'→'eggplant' tout en attrapant 'lait' pour lactose.
 * PORT FIDÈLE de ScoringService.allergenHit (backend).
 */
function allergenHit(a: string, hay: string, tags: string[]): boolean {
  if (!a) return false;
  if (tags.includes(a)) return true;
  const terms = [a, ...(ALLERGEN_SYNONYMS[a] ?? [])];
  for (const t of terms) {
    if (!t) continue;
    if (tags.includes(t)) return true;
    const re = new RegExp('\\b' + escapeRe(t), 'i');
    if (re.test(hay)) return true;
  }
  return false;
}

/** Contexte robuste : remplit tous les défauts sûrs. */
function safeCtx(ctx?: Partial<ObjectiveContext> | null): ObjectiveContext {
  const c = ctx ?? {};
  const goal = (['lose', 'maintain', 'gain'] as const).includes(c.goal as any)
    ? (c.goal as 'lose' | 'maintain' | 'gain')
    : 'maintain';
  const mt = c.macroTargets ?? ({} as any);
  const rm = c.remainingMacros ?? ({} as any);
  return {
    uid: c.uid,
    goal,
    tdee: num(c.tdee, 0),
    dailyKcalTarget: num(c.dailyKcalTarget, 0),
    remainingKcal: num(c.remainingKcal, 0),
    macroTargets: {
      protein: Math.max(0, num(mt.protein, 0)),
      carbs: Math.max(0, num(mt.carbs, 0)),
      fat: Math.max(0, num(mt.fat, 0)),
    },
    remainingMacros: {
      protein: Math.max(0, num(rm.protein, 0)),
      carbs: Math.max(0, num(rm.carbs, 0)),
      fat: Math.max(0, num(rm.fat, 0)),
    },
    diet: normList(c.diet),
    allergies: normList(c.allergies),
    dislikes: normList(c.dislikes),
    conditions: normList(c.conditions),
  };
}

/**
 * Applique les règles RÉGIME MÉDICAL. Renvoie un blocage DUR immédiat (celiac
 * + gluten) le cas échéant, sinon un delta de fit cumulé (négatif) + des
 * reasons. Règles conservatrices : on s'appuie sur les tags de l'aliment ET
 * des heuristiques sur les macros (pas de macro sodium/potassium dispo).
 *
 * PORT FIDÈLE de la logique médicale inline de ScoringService.scoreFood
 * (backend fait autorité) : mêmes seuils de densité (g/100 kcal), mêmes
 * magnitudes de pénalité, mêmes regex celiac (mots-clés gluten fusionnés).
 * Guidance diététique — PAS un diagnostic. Chaque reason porte le disclaimer.
 */
function applyMedicalConditions(
  food: Required<FoodCandidate>,
  hay: string,
  conditions: string[],
  /**
   * Sucre brut (g) éventuellement fourni par le candidate, lu de façon
   * DÉFENSIVE (le type FoodCandidate ne déclare pas `sugar`). Sert uniquement
   * d'affinage du proxy de charge glycémique en contexte diabète. `undefined`
   * si absent → on retombe sur la seule densité de glucides.
   */
  sugarG?: number,
): { blocked?: FoodScore; delta: number; reasons: string[] } {
  const reasons: string[] = [];
  let delta = 0;
  if (!conditions.length) return { delta, reasons };

  const has = (t: string) => food.tags.includes(t);
  const nameHas = (re: RegExp) => re.test(hay);
  // Densité protéines / glucides (g/100 kcal) — mêmes proxys que le backend.
  const proteinDensityMed = (food.protein / Math.max(food.kcal, 1)) * 100;
  const carbDensityMed = (food.carbs / Math.max(food.kcal, 1)) * 100;
  const medicNote = ' — à confirmer avec ton médecin';

  // --- CŒLIAQUE : gluten = blocage dur (comme une allergie). ---
  if (conditions.includes('celiac')) {
    if (
      has('gluten') ||
      has('wheat') ||
      has('barley') ||
      has('rye') ||
      nameHas(
        /\b(gluten|ble|blé|wheat|orge|barley|seigle|rye|malt|pain|bread|pate|pâte|pasta|pizza|semoule|couscous|biscuit|gateau|gâteau|viennoiser|croissant|baguette|biere|bière|beer)/,
      )
    ) {
      return {
        delta,
        reasons,
        blocked: {
          fit: 0,
          verdict: 'avoid',
          reasons: [`Contient du gluten — à éviter (maladie cœliaque)${medicNote}`],
          blocked: true,
        },
      };
    }
  }

  // --- DIABÈTE : limite sucre / glucides raffinés / IG élevé. ---
  if (conditions.includes('diabetes')) {
    // Proxy de CHARGE GLYCÉMIQUE (feature #92) — estimé à partir des seules
    // données déjà disponibles, sans nouvelle macro requise :
    //   glProxy ≈ densité de glucides (g/100 kcal, corrélée à la teneur en
    //   glucides digestibles) + bonus si `sugar` brut est fourni (les sucres
    //   libres ont un IG plus élevé), atténué par la présence de fibres
    //   (tags high_fiber/fiber) qui abaissent la charge glycémique réelle.
    // C'est un PROXY conservateur, PAS une mesure d'IG/CG clinique : il sert
    // seulement à nuancer la reason et à un micro-ajustement borné du score.
    const hasFiber = has('high_fiber') || has('fiber');
    const sugarDensity =
      typeof sugarG === 'number' && Number.isFinite(sugarG)
        ? (Math.max(0, sugarG) / Math.max(food.kcal, 1)) * 100 // g sucre / 100 kcal
        : 0;
    // Base = densité glucides ; les sucres libres pèsent double dans le proxy ;
    // les fibres retranchent une part forfaitaire (plafonnée à la base).
    const glProxy = Math.max(
      0,
      carbDensityMed + sugarDensity * 1.5 - (hasFiber ? Math.min(carbDensityMed, 6) : 0),
    );

    if (has('high_sugar') || has('sugar') || nameHas(/\b(sucre|soda|bonbon|confiserie|sirop|jus|miel|nutella|candy|dessert|patisser|pâtisser|gateau|gâteau)/)) {
      delta -= 20;
      reasons.push(`Riche en sucre — à limiter (diabète)${medicNote}`);
    } else if (has('refined_carb') || has('white_carb') || nameHas(/\b(pain blanc|riz blanc|frite|puree|purée|corn ?flakes)/)) {
      delta -= 12;
      reasons.push(`Glucides raffinés (index glycémique élevé) — à modérer (diabète)${medicNote}`);
    } else if (carbDensityMed >= 12 && !hasFiber) {
      // Heuristique macro : dense en glucides & pauvre en fibres.
      delta -= 10;
      reasons.push(`Charge glycémique élevée, peu de fibres — à modérer (diabète)${medicNote}`);
    } else {
      // Aucune reason forte n'a été déclenchée : on affine avec le proxy de
      // charge glycémique via un ajustement BORNÉ (±3), qui ne renverse pas le
      // verdict mais rend l'info utile au contexte diabète.
      if (glProxy >= 8) {
        delta -= 3;
        reasons.push(`Charge glycémique modérée — à surveiller (diabète)${medicNote}`);
      } else if (glProxy <= 3 && food.carbs > 0) {
        delta += 3;
        reasons.push(`Charge glycémique faible — bien toléré (diabète)${medicNote}`);
      }
    }
  }

  // --- HYPERTENSION : limite sodium / sel (pas de macro sodium → tags/nom). ---
  if (conditions.includes('hypertension')) {
    if (
      has('high_sodium') ||
      has('salty') ||
      has('processed') ||
      nameHas(/\b(chips|charcuterie|saucisson|jambon|bacon|lardon|sel|salaison|olive|cornichon|sauce soja|soja|bouillon|conserve|fast ?food|nugget|pizza|frite)/)
    ) {
      delta -= 18;
      reasons.push(`Riche en sel/sodium — à limiter (hypertension)${medicNote}`);
    }
  }

  // --- CHOLESTÉROL : limite graisses saturées. ---
  if (conditions.includes('high_cholesterol')) {
    if (
      has('saturated_fat') ||
      has('fried') ||
      has('fat') ||
      nameHas(/\b(beurre|creme|crème|fromage|charcuterie|friture|frit|frite|bacon|lardon|viennoiser|palme|saindoux|pate|pâté|abats)/)
    ) {
      delta -= 15;
      reasons.push(`Riche en graisses saturées — à limiter (cholestérol)${medicNote}`);
    }
  }

  // --- REIN : limite protéines / potassium / phosphore / sodium. ---
  if (conditions.includes('kidney')) {
    if (proteinDensityMed >= 12 || has('high_protein') || has('highp') || has('highprotein')) {
      delta -= 15;
      reasons.push(`Charge protéique élevée — à limiter (insuffisance rénale)${medicNote}`);
    }
    if (
      has('high_potassium') ||
      has('high_phosphorus') ||
      has('high_sodium') ||
      nameHas(/\b(banane|abricot sec|fruit sec|noix|chocolat|fromage|abats|conserve|charcuterie|cola)/)
    ) {
      delta -= 12;
      reasons.push(`Riche en potassium/phosphore/sodium — à surveiller (rein)${medicNote}`);
    }
  }

  // --- IBS / LOW-FODMAP : limite les FODMAP. ---
  if (conditions.includes('ibs') || conditions.includes('lowfodmap')) {
    if (
      has('high_fodmap') ||
      has('fodmap') ||
      nameHas(/\b(oignon|ail|chou|haricot|lentille|pois chiche|legumineuse|légumineuse|lait|creme|crème|fromage frais|ble|blé|wheat|miel|pomme|poire|mangue|pasteque|pastèque|champignon)/)
    ) {
      delta -= 12;
      reasons.push(`Riche en FODMAP — peut déclencher des symptômes (SII)${medicNote}`);
    }
  }

  // --- GOUTTE : limite purines / viande rouge / alcool. ---
  if (conditions.includes('gout')) {
    if (
      has('high_purine') ||
      has('red_meat') ||
      has('alcohol') ||
      nameHas(/\b(viande rouge|boeuf|bœuf|agneau|abats|foie|rognon|gibier|charcuterie|sardine|anchois|hareng|maquereau|crustace|crustacé|fruit de mer|biere|bière|alcool|vin)/)
    ) {
      delta -= 15;
      reasons.push(`Riche en purines / viande rouge / alcool — à limiter (goutte)${medicNote}`);
    }
  }

  return { delta, reasons };
}

/** Aliment robuste : valeurs numériques sûres + tags normalisés. */
function safeFood(f?: Partial<FoodCandidate> | null): Required<FoodCandidate> {
  const x = f ?? {};
  return {
    name: String(x.name ?? '').trim() || 'aliment',
    kcal: Math.max(0, num(x.kcal, 0)),
    protein: Math.max(0, num(x.protein, 0)),
    carbs: Math.max(0, num(x.carbs, 0)),
    fat: Math.max(0, num(x.fat, 0)),
    tags: normList(x.tags),
  };
}

/**
 * Score un aliment vs le contexte d'objectif. Pur & robuste.
 * Port fidèle de ScoringService.scoreFood.
 */
export function scoreFood(f: FoodCandidate, ctx: ObjectiveContext): FoodScore {
  try {
    const food = safeFood(f);
    const c = safeCtx(ctx);
    const hay = `${norm(food.name)} ${food.tags.join(' ')}`;

    // -----------------------------------------------------------------------
    // 1) BLOCAGES DURS (allergies + halal)
    // -----------------------------------------------------------------------
    const reasons: string[] = [];

    // Allergies : match à FRONTIÈRE DE MOT (RegExp) sur tag/nom + familles.
    for (const a of c.allergies) {
      if (!a) continue;
      if (allergenHit(a, hay, food.tags)) {
        return {
          fit: 0,
          verdict: 'avoid',
          reasons: [`Contient un allergène déclaré : ${a}`],
          blocked: true,
        };
      }
    }

    // Halal : régime contenant 'halal' → bloque le porc (tag 'pork' ou nom).
    const isHalal = c.diet.some((d) => d.includes('halal'));
    if (isHalal && (food.tags.includes('pork') || /\b(porc|pork|jambon|bacon|lardon)/.test(hay))) {
      return {
        fit: 0,
        verdict: 'avoid',
        reasons: ['Non halal (porc) — bloqué par le régime'],
        blocked: true,
      };
    }

    // Végétarien / végan : blocage DUR si viande/poisson (nom ou tags).
    // Contrainte de préférence, PAS médicale (aucun disclaimer médecin).
    const isVeg = c.diet.some((d) => d.includes('vegetarian') || d.includes('vegan'));
    if (
      isVeg &&
      (food.tags.includes('meat') ||
        food.tags.includes('fish') ||
        food.tags.includes('pork') ||
        /\b(viande|meat|boeuf|bœuf|beef|porc|pork|jambon|ham|bacon|lardon|poulet|chicken|dinde|turkey|agneau|lamb|veau|veal|canard|duck|charcuterie|saucisse|sausage|saucisson|poisson|fish|thon|tuna|saumon|salmon|cabillaud|crevette|shrimp|crustace|fruit de mer|seafood|gelatine)/.test(
          hay,
        ))
    ) {
      return {
        fit: 0,
        verdict: 'avoid',
        reasons: ['Contient de la viande/du poisson — bloqué par le régime végétarien/végan'],
        blocked: true,
      };
    }

    // Régime médical : blocage DUR (celiac + gluten) prioritaire.
    // `sugar` est lu de façon DÉFENSIVE : il n'est pas déclaré sur FoodCandidate
    // mais certains candidates (menu/ticket/frigo) peuvent le fournir. Sert
    // uniquement d'affinage du proxy de charge glycémique (contexte diabète).
    const rawSugar = (f as { sugar?: unknown })?.sugar;
    const sugarG = typeof rawSugar === 'number' && Number.isFinite(rawSugar) ? rawSugar : undefined;
    const med = applyMedicalConditions(food, hay, c.conditions, sugarG);
    if (med.blocked) return med.blocked;

    // -----------------------------------------------------------------------
    // 2) ADÉQUATION CALORIQUE vs budget restant (cœur du score)
    //    Cible = ~1/3 du remaining (1/2 si prise de masse).
    // -----------------------------------------------------------------------
    let fit = 60; // base neutre
    const targetFraction = c.goal === 'gain' ? 0.5 : 1 / 3;
    const remaining = c.remainingKcal;

    if (remaining > 0) {
      const idealKcal = remaining * targetFraction;
      if (food.kcal > remaining) {
        // Dépasse le budget restant : pénalité proportionnelle, fort si gros dépassement.
        const over = (food.kcal - remaining) / remaining; // >0
        fit -= Math.min(60, 25 + over * 40);
        reasons.push(
          `Dépasse les ${Math.round(remaining)} kcal restantes (${Math.round(food.kcal)} kcal)`,
        );
      } else if (food.kcal > 0) {
        // Proximité à la portion idéale : écart relatif normalisé.
        const rel = Math.abs(food.kcal - idealKcal) / Math.max(idealKcal, 1);
        const prox = Math.max(0, 1 - rel); // 1 = pile la cible
        fit += prox * 30; // jusqu'à +30
        if (prox > 0.66) {
          reasons.push(`Portion bien calibrée (~${Math.round(idealKcal)} kcal visées)`);
        } else if (food.kcal < idealKcal * 0.5) {
          reasons.push('Léger pour le budget restant');
        }
      }
    } else {
      // Plus de budget : tout ce qui apporte des kcal est pénalisé.
      if (food.kcal > 0) {
        fit -= 30;
        reasons.push('Budget calorique du jour atteint');
      }
    }

    // -----------------------------------------------------------------------
    // 3) BONUS PROTÉINES (lose / maintain)
    // -----------------------------------------------------------------------
    if (c.goal === 'lose' || c.goal === 'maintain') {
      const proteinDensity = (food.protein / Math.max(food.kcal, 1)) * 100; // g/100 kcal
      if (proteinDensity >= 10 || food.tags.includes('highp') || food.tags.includes('highprotein')) {
        const bonus = Math.min(15, proteinDensity * 0.8);
        fit += bonus;
        reasons.push('Riche en protéines (rassasiant)');
      }
      // Bonus supplémentaire si on manque encore de protéines aujourd'hui.
      if (c.remainingMacros.protein > 0 && food.protein > 0) {
        const cover = Math.min(1, food.protein / c.remainingMacros.protein);
        fit += cover * 8;
      }
    }

    // -----------------------------------------------------------------------
    // 4) MALUS DENSITÉ CALORIQUE (lose) — kcal très denses = à éviter en sèche.
    // -----------------------------------------------------------------------
    if (c.goal === 'lose') {
      // densité par "portion lourde" : on pénalise les aliments très caloriques
      // ET pauvres en protéines (gras/sucres).
      const proteinDensity = (food.protein / Math.max(food.kcal, 1)) * 100;
      const calorieDense =
        (food.kcal >= 300 && proteinDensity < 8) ||
        food.tags.includes('fried') ||
        food.tags.includes('fat') ||
        food.tags.includes('sugar');
      if (calorieDense) {
        fit -= 15;
        reasons.push('Dense en calories — à limiter en perte de poids');
      }
    }

    // -----------------------------------------------------------------------
    // 5) DISLIKES (préférence, pas un blocage) — léger malus.
    // -----------------------------------------------------------------------
    for (const d of c.dislikes) {
      if (d && (food.tags.includes(d) || hay.includes(d))) {
        fit -= 8;
        reasons.push(`Aliment non aimé : ${d}`);
        break;
      }
    }

    // -----------------------------------------------------------------------
    // 5bis) RÉGIME MÉDICAL (pénalités + reasons non bloquantes)
    //       Cumulé après les préférences ; chaque reason porte le disclaimer.
    // -----------------------------------------------------------------------
    if (med.delta) fit += med.delta;
    for (const r of med.reasons) reasons.push(r);

    // -----------------------------------------------------------------------
    // 6) CLAMP + VERDICT
    // -----------------------------------------------------------------------
    fit = Math.max(0, Math.min(100, Math.round(fit)));
    const verdict: FoodScore['verdict'] = fit >= 70 ? 'great' : fit >= 45 ? 'ok' : 'avoid';
    if (!reasons.length) reasons.push('Compatible avec votre objectif');

    return { fit, verdict, reasons, blocked: false };
  } catch {
    // Robustesse totale : jamais d'exception qui remonte au caller.
    return {
      fit: 50,
      verdict: 'ok',
      reasons: ['Score par défaut (données insuffisantes)'],
      blocked: false,
    };
  }
}
