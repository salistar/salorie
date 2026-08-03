import { Injectable } from '@nestjs/common';
import {
  FoodCandidate,
  FoodScore,
  ObjectiveContext,
} from './objective.types';

/**
 * ScoringService — scoring PUR d'un aliment vs l'objectif du jour.
 *
 * scoreFood est une fonction pure, testable et robuste :
 *  - blocage DUR sur allergies (match tag/nom) et halal (tag 'pork' si régime halal) ;
 *  - adéquation au remainingKcal : on vise ~1/3 du budget restant (1/2 si goal='gain') ;
 *  - bonus protéines (lose/maintain) ;
 *  - malus densité calorique (lose) ;
 *  - verdict great / ok / avoid.
 *
 * Tout contexte manquant retombe sur des défauts sûrs (jamais d'exception).
 */
/** Langues prises en charge par les libelles de scoring. */
export type ScoreLang = 'fr' | 'en' | 'ar';

/**
 * Libelles des `reasons`.
 *
 * Ces phrases etaient en dur en francais et renvoyees telles quelles a l'application,
 * quelle que soit la langue de l'utilisateur. Onze sont des conseils nommement lies a une
 * pathologie. Le mobile les affiche directement (ecrans mode restaurant, ticket de caisse,
 * code-barres) : un utilisateur anglophone recevait donc un avis de sante en francais.
 *
 * Le contrat d'API n'a pas bouge : l'application envoyait deja son ObjectiveContext
 * complet, qui porte desormais `lang`. Le backend l'ignorait simplement.
 *
 * Table identique a celle de lib/objective/scoring.ts cote mobile : le meme aliment doit
 * produire la meme phrase, que le score soit calcule sur l'appareil ou ici.
 */
const MSG: Record<string, Record<ScoreLang, string>> = {
  medicNote: {
    fr: ' — a confirmer avec ton medecin',
    en: ' — confirm with your doctor',
    ar: ' — يُرجى التأكيد مع طبيبك',
  },
  allergen: {
    fr: 'Contient un allergene declare : {a}',
    en: 'Contains a declared allergen: {a}',
    ar: 'يحتوي على مُسبّب حساسية مُصرّح به: {a}',
  },
  halal: {
    fr: 'Non halal (porc) — bloque par le regime',
    en: 'Not halal (pork) — blocked by your diet',
    ar: 'غير حلال (لحم خنزير) — مرفوض حسب نظامك',
  },
  vegetarian: {
    fr: 'Contient de la viande/du poisson — bloque par le regime vegetarien/vegan',
    en: 'Contains meat or fish — blocked by your vegetarian/vegan diet',
    ar: 'يحتوي على لحم أو سمك — مرفوض حسب النظام النباتي',
  },
  gluten: {
    fr: 'Contient du gluten — a eviter (maladie coeliaque)',
    en: 'Contains gluten — avoid (coeliac disease)',
    ar: 'يحتوي على الغلوتين — يُتجنّب (الداء البطني)',
  },
  sugarDiabetes: {
    fr: 'Riche en sucre — a limiter (diabete)',
    en: 'High in sugar — limit (diabetes)',
    ar: 'غني بالسكر — يُحدّ منه (السكري)',
  },
  refinedCarbs: {
    fr: 'Glucides raffines (index glycemique eleve) — a moderer (diabete)',
    en: 'Refined carbs (high glycaemic index) — moderate (diabetes)',
    ar: 'كربوهيدرات مكرّرة (مؤشر جلايسيمي مرتفع) — يُعتدل فيها (السكري)',
  },
  highGL: {
    fr: 'Charge glycemique elevee, peu de fibres — a moderer (diabete)',
    en: 'High glycaemic load, low fibre — moderate (diabetes)',
    ar: 'حمل جلايسيمي مرتفع وألياف قليلة — يُعتدل فيه (السكري)',
  },
  modGL: {
    fr: 'Charge glycemique moderee — a surveiller (diabete)',
    en: 'Moderate glycaemic load — keep an eye on it (diabetes)',
    ar: 'حمل جلايسيمي معتدل — يُراقَب (السكري)',
  },
  lowGL: {
    fr: 'Charge glycemique faible — bien tolere (diabete)',
    en: 'Low glycaemic load — well tolerated (diabetes)',
    ar: 'حمل جلايسيمي منخفض — جيّد التحمّل (السكري)',
  },
  sodium: {
    fr: 'Riche en sel/sodium — a limiter (hypertension)',
    en: 'High in salt/sodium — limit (high blood pressure)',
    ar: 'غني بالملح/الصوديوم — يُحدّ منه (ارتفاع ضغط الدم)',
  },
  satFat: {
    fr: 'Riche en graisses saturees — a limiter (cholesterol)',
    en: 'High in saturated fat — limit (cholesterol)',
    ar: 'غني بالدهون المشبعة — يُحدّ منه (الكوليسترول)',
  },
  proteinKidney: {
    fr: 'Charge proteique elevee — a limiter (insuffisance renale)',
    en: 'High protein load — limit (kidney failure)',
    ar: 'حمل بروتيني مرتفع — يُحدّ منه (القصور الكلوي)',
  },
  minerals: {
    fr: 'Riche en potassium/phosphore/sodium — a surveiller (rein)',
    en: 'High in potassium/phosphorus/sodium — keep an eye on it (kidneys)',
    ar: 'غني بالبوتاسيوم/الفوسفور/الصوديوم — يُراقَب (الكلى)',
  },
  fodmap: {
    fr: 'Riche en FODMAP — peut declencher des symptomes (SII)',
    en: 'High in FODMAPs — may trigger symptoms (IBS)',
    ar: 'غني بالفودماب — قد يُثير الأعراض (القولون العصبي)',
  },
  purines: {
    fr: 'Riche en purines / viande rouge / alcool — a limiter (goutte)',
    en: 'High in purines / red meat / alcohol — limit (gout)',
    ar: 'غني بالبيورينات / اللحم الأحمر / الكحول — يُحدّ منه (النقرس)',
  },
  wellSized: {
    fr: 'Portion bien calibree (~{a} kcal visees)',
    en: 'Well-sized portion (~{a} kcal target)',
    ar: 'حصة مضبوطة (~{a} سعرة مستهدفة)',
  },
  light: {
    fr: 'Leger pour le budget restant',
    en: 'Light for your remaining budget',
    ar: 'خفيف بالنسبة لما تبقّى لك',
  },
  budgetReached: {
    fr: 'Budget calorique du jour atteint',
    en: "Today's calorie budget is used up",
    ar: 'استُنفدت سعرات اليوم',
  },
  highProtein: {
    fr: 'Riche en proteines (rassasiant)',
    en: 'High in protein (filling)',
    ar: 'غني بالبروتين (مُشبع)',
  },
  calorieDense: {
    fr: 'Dense en calories — a limiter en perte de poids',
    en: 'Calorie-dense — limit when losing weight',
    ar: 'كثيف السعرات — يُحدّ منه عند إنقاص الوزن',
  },
  disliked: {
    fr: 'Aliment non aime : {a}',
    en: 'Food you dislike: {a}',
    ar: 'طعام لا تحبّه: {a}',
  },
  compatible: {
    fr: 'Compatible avec votre objectif',
    en: 'Fits your goal',
    ar: 'يتوافق مع هدفك',
  },
  defaultScore: {
    fr: 'Score par defaut (donnees insuffisantes)',
    en: 'Default score (not enough data)',
    ar: 'تقييم افتراضي (بيانات غير كافية)',
  },
};

/** Libelle traduit ; retombe sur le francais si la langue est inconnue. */
function m(lang: ScoreLang, key: keyof typeof MSG, a?: string | number): string {
  const row = MSG[key];
  let out = (row && (row[lang] || row.fr)) || '';
  if (a !== undefined) out = out.replace('{a}', String(a));
  return out;
}

@Injectable()
export class ScoringService {
  /** Normalise une chaîne pour comparaison (minuscule, sans accents, trim). */
  private static norm(s: unknown): string {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /** Liste de chaînes normalisées non vides à partir d'une valeur quelconque. */
  private static normList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => ScoringService.norm(x)).filter(Boolean);
  }

  /** Nombre fini >= 0, sinon défaut. */
  private static num(v: unknown, def = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** Échappe une chaîne pour insertion littérale dans une RegExp. */
  private static escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Familles/synonymes d'allergènes alignés sur offToTags : un allergène déclaré
   * (clé) attrape aussi ses synonymes/aliments porteurs (valeurs) via un match à
   * FRONTIÈRE DE MOT. Les clés/valeurs sont normalisées (minuscule, sans accents).
   */
  private static readonly ALLERGEN_SYNONYMS: Record<string, string[]> = {
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
   * FRONTIÈRE DE MOT (RegExp `\ba`), sur l'allergène lui-même ET ses
   * synonymes/familles. Évite 'egg'→'eggplant' tout en attrapant 'lait' pour
   * lactose. `a` et `hay` sont supposés déjà normalisés.
   */
  private static allergenHit(a: string, hay: string, tags: string[]): boolean {
    if (!a) return false;
    if (tags.includes(a)) return true;
    const terms = [a, ...(ScoringService.ALLERGEN_SYNONYMS[a] ?? [])];
    for (const t of terms) {
      if (!t) continue;
      if (tags.includes(t)) return true;
      const re = new RegExp('\\b' + ScoringService.escapeRe(t), 'i');
      if (re.test(hay)) return true;
    }
    return false;
  }

  /** Contexte robuste : remplit tous les défauts sûrs. */
  private static safeCtx(ctx?: Partial<ObjectiveContext> | null): ObjectiveContext {
    const c = ctx ?? {};
    const goal = (['lose', 'maintain', 'gain'] as const).includes(c.goal as any)
      ? (c.goal as 'lose' | 'maintain' | 'gain')
      : 'maintain';
    const mt = c.macroTargets ?? ({} as any);
    const rm = c.remainingMacros ?? ({} as any);
    // Langue validee ici : une valeur inattendue retombe sur le francais plutot que
    // de produire des libelles vides.
    const lang: ScoreLang = (['fr', 'en', 'ar'] as const).includes(c.lang as any)
      ? (c.lang as ScoreLang)
      : 'fr';
    return {
      uid: c.uid,
      lang,
      goal,
      tdee: ScoringService.num(c.tdee, 0),
      dailyKcalTarget: ScoringService.num(c.dailyKcalTarget, 0),
      remainingKcal: ScoringService.num(c.remainingKcal, 0),
      macroTargets: {
        protein: Math.max(0, ScoringService.num(mt.protein, 0)),
        carbs: Math.max(0, ScoringService.num(mt.carbs, 0)),
        fat: Math.max(0, ScoringService.num(mt.fat, 0)),
      },
      remainingMacros: {
        protein: Math.max(0, ScoringService.num(rm.protein, 0)),
        carbs: Math.max(0, ScoringService.num(rm.carbs, 0)),
        fat: Math.max(0, ScoringService.num(rm.fat, 0)),
      },
      diet: ScoringService.normList(c.diet),
      allergies: ScoringService.normList(c.allergies),
      dislikes: ScoringService.normList(c.dislikes),
      conditions: ScoringService.normList(c.conditions),
    };
  }

  /** Aliment robuste : valeurs numériques sûres + tags normalisés. */
  private static safeFood(f?: Partial<FoodCandidate> | null): Required<FoodCandidate> {
    const x = f ?? {};
    return {
      name: String(x.name ?? '').trim() || 'aliment',
      kcal: Math.max(0, ScoringService.num(x.kcal, 0)),
      protein: Math.max(0, ScoringService.num(x.protein, 0)),
      carbs: Math.max(0, ScoringService.num(x.carbs, 0)),
      fat: Math.max(0, ScoringService.num(x.fat, 0)),
      tags: ScoringService.normList(x.tags),
    };
  }

  /**
   * Score un aliment vs le contexte d'objectif. Pur & robuste.
   */
  scoreFood(f: FoodCandidate, ctx: ObjectiveContext): FoodScore {
    // Langue lue AVANT le try : le bloc catch renvoie lui aussi un libelle, et il doit
    // rester increvable. D'ou une lecture defensive directe plutot qu'un passage par
    // safeCtx, qui est appele a l'interieur du try.
    const lang: ScoreLang = (['fr', 'en', 'ar'] as const).includes((ctx as any)?.lang)
      ? ((ctx as any).lang as ScoreLang)
      : 'fr';
    try {
      const food = ScoringService.safeFood(f);
      const c = ScoringService.safeCtx(ctx);
      const hay = `${ScoringService.norm(food.name)} ${food.tags.join(' ')}`;
      // `sugar` lu de façon DÉFENSIVE : non déclaré sur FoodCandidate mais
      // certains candidates (menu/ticket/frigo) peuvent le fournir. Sert
      // uniquement d'affinage du proxy de charge glycémique (contexte diabète).
      const rawSugar = (f as { sugar?: unknown } | null | undefined)?.sugar;
      const sugarG =
        typeof rawSugar === 'number' && Number.isFinite(rawSugar) ? rawSugar : undefined;

      // -----------------------------------------------------------------------
      // 1) BLOCAGES DURS (allergies + halal)
      // -----------------------------------------------------------------------
      const reasons: string[] = [];

      // Allergies : match à FRONTIÈRE DE MOT (RegExp) sur tag/nom + familles.
      for (const a of c.allergies) {
        if (!a) continue;
        if (ScoringService.allergenHit(a, hay, food.tags)) {
          return {
            fit: 0,
            verdict: 'avoid',
            reasons: [m(lang, 'allergen', a)],
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
          reasons: [m(lang, 'halal')],
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
          reasons: [m(lang, 'vegetarian')],
          blocked: true,
        };
      }

      // -----------------------------------------------------------------------
      // 1bis) RÉGIME MÉDICAL — guidance diététique conservatrice (PAS un diagnostic)
      //    Chaque condition ajoute des pénalités de fit + reasons claires.
      //    Cœliaque (gluten) = BLOCAGE DUR. Les autres = pénalités graduées.
      //    Toujours suffixer d'un rappel "à confirmer avec ton médecin".
      // -----------------------------------------------------------------------
      const conditions = c.conditions;
      // Réductions de fit médicales à appliquer après le calcul du fit de base.
      const medicalPenalties: number[] = [];
      const has = (t: string) => food.tags.includes(t);
      const nameHas = (re: RegExp) => re.test(hay);
      // Densité protéines (g/100 kcal) — réutilisée par plusieurs conditions.
      const proteinDensityMed = (food.protein / Math.max(food.kcal, 1)) * 100;
      // Densité glucides (g/100 kcal) : proxy d'aliment glucidique.
      const carbDensityMed = (food.carbs / Math.max(food.kcal, 1)) * 100;
      const medicNote = m(lang, 'medicNote');

      if (conditions.length) {
        // --- CŒLIAQUE : gluten = blocage dur (comme une allergie). ---
        if (conditions.includes('celiac')) {
          if (
            has('gluten') ||
            nameHas(
              /\b(gluten|ble|blé|wheat|orge|barley|seigle|rye|malt|pain|pate|pâte|pasta|pizza|semoule|couscous|biscuit|gateau|gâteau|viennoiser|croissant|baguette)/,
            )
          ) {
            return {
              fit: 0,
              verdict: 'avoid',
              reasons: [m(lang, 'gluten') + medicNote],
              blocked: true,
            };
          }
        }

        // --- DIABÈTE : limite sucre / glucides raffinés / IG élevé. ---
        if (conditions.includes('diabetes')) {
          // Proxy de CHARGE GLYCÉMIQUE (feature #92) — estimé à partir des
          // seules données déjà disponibles, sans nouvelle macro requise :
          //   glProxy ≈ densité de glucides (g/100 kcal, corrélée à la teneur
          //   en glucides digestibles) + bonus si `sugar` brut est fourni (les
          //   sucres libres ont un IG plus élevé), atténué par la présence de
          //   fibres (tags high_fiber/fiber) qui abaissent la charge réelle.
          // PROXY conservateur, PAS une mesure d'IG/CG clinique : il sert
          // seulement à nuancer la reason et à un micro-ajustement borné du score.
          const hasFiber = has('high_fiber') || has('fiber');
          const sugarDensity =
            typeof sugarG === 'number' && Number.isFinite(sugarG)
              ? (Math.max(0, sugarG) / Math.max(food.kcal, 1)) * 100 // g sucre / 100 kcal
              : 0;
          // Base = densité glucides ; les sucres libres pèsent double dans le
          // proxy ; les fibres retranchent une part forfaitaire (plafonnée).
          const glProxy = Math.max(
            0,
            carbDensityMed + sugarDensity * 1.5 - (hasFiber ? Math.min(carbDensityMed, 6) : 0),
          );

          if (has('high_sugar') || has('sugar') || nameHas(/\b(sucre|soda|bonbon|confiserie|sirop|jus|miel|nutella|candy|dessert|patisser|pâtisser|gateau|gâteau)/)) {
            medicalPenalties.push(20);
            reasons.push(m(lang, 'sugarDiabetes') + medicNote);
          } else if (has('refined_carb') || has('white_carb') || nameHas(/\b(pain blanc|riz blanc|frite|puree|purée|corn ?flakes)/)) {
            medicalPenalties.push(12);
            reasons.push(m(lang, 'refinedCarbs') + medicNote);
          } else if (carbDensityMed >= 12 && !hasFiber) {
            // Heuristique macro : dense en glucides & pauvre en fibres.
            medicalPenalties.push(10);
            reasons.push(m(lang, 'highGL') + medicNote);
          } else {
            // Aucune reason forte n'a été déclenchée : on affine avec le proxy
            // de charge glycémique via un ajustement BORNÉ (±3), qui ne renverse
            // pas le verdict mais rend l'info utile au contexte diabète.
            // (medicalPenalties est soustrait du fit : une valeur négative =
            //  petit bonus.)
            if (glProxy >= 8) {
              medicalPenalties.push(3);
              reasons.push(m(lang, 'modGL') + medicNote);
            } else if (glProxy <= 3 && food.carbs > 0) {
              medicalPenalties.push(-3);
              reasons.push(m(lang, 'lowGL') + medicNote);
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
            medicalPenalties.push(18);
            reasons.push(m(lang, 'sodium') + medicNote);
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
            medicalPenalties.push(15);
            reasons.push(m(lang, 'satFat') + medicNote);
          }
        }

        // --- REIN : limite protéines / potassium / phosphore / sodium. ---
        if (conditions.includes('kidney')) {
          if (proteinDensityMed >= 12 || has('high_protein') || has('highp') || has('highprotein')) {
            medicalPenalties.push(15);
            reasons.push(m(lang, 'proteinKidney') + medicNote);
          }
          if (
            has('high_potassium') ||
            has('high_phosphorus') ||
            has('high_sodium') ||
            nameHas(/\b(banane|abricot sec|fruit sec|noix|chocolat|fromage|abats|conserve|charcuterie|cola)/)
          ) {
            medicalPenalties.push(12);
            reasons.push(m(lang, 'minerals') + medicNote);
          }
        }

        // --- IBS / LOW-FODMAP : limite les FODMAP. ---
        if (conditions.includes('ibs') || conditions.includes('lowfodmap')) {
          if (
            has('high_fodmap') ||
            has('fodmap') ||
            nameHas(/\b(oignon|ail|chou|haricot|lentille|pois chiche|legumineuse|légumineuse|lait|creme|crème|fromage frais|ble|blé|wheat|miel|pomme|poire|mangue|pasteque|pastèque|champignon)/)
          ) {
            medicalPenalties.push(12);
            reasons.push(m(lang, 'fodmap') + medicNote);
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
            medicalPenalties.push(15);
            reasons.push(m(lang, 'purines') + medicNote);
          }
        }
      }

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
            reasons.push(m(lang, 'wellSized', Math.round(idealKcal)));
          } else if (food.kcal < idealKcal * 0.5) {
            reasons.push(m(lang, 'light'));
          }
        }
      } else {
        // Plus de budget : tout ce qui apporte des kcal est pénalisé.
        if (food.kcal > 0) {
          fit -= 30;
          reasons.push(m(lang, 'budgetReached'));
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
          reasons.push(m(lang, 'highProtein'));
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
          food.kcal >= 300 && proteinDensity < 8 ||
          food.tags.includes('fried') ||
          food.tags.includes('fat') ||
          food.tags.includes('sugar');
        if (calorieDense) {
          fit -= 15;
          reasons.push(m(lang, 'calorieDense'));
        }
      }

      // -----------------------------------------------------------------------
      // 5) DISLIKES (préférence, pas un blocage) — léger malus.
      // -----------------------------------------------------------------------
      for (const d of c.dislikes) {
        if (d && (food.tags.includes(d) || hay.includes(d))) {
          fit -= 8;
          reasons.push(m(lang, 'disliked', d));
          break;
        }
      }

      // -----------------------------------------------------------------------
      // 5bis) PÉNALITÉS MÉDICALES (accumulées en 1bis) — appliquées au fit.
      // -----------------------------------------------------------------------
      for (const p of medicalPenalties) fit -= p;

      // -----------------------------------------------------------------------
      // 6) CLAMP + VERDICT
      // -----------------------------------------------------------------------
      fit = Math.max(0, Math.min(100, Math.round(fit)));
      const verdict: FoodScore['verdict'] = fit >= 70 ? 'great' : fit >= 45 ? 'ok' : 'avoid';
      if (!reasons.length) reasons.push(m(lang, 'compatible'));

      return { fit, verdict, reasons, blocked: false };
    } catch {
      // Robustesse totale : jamais d'exception qui remonte au caller.
      return {
        fit: 50,
        verdict: 'ok',
        reasons: [m(lang, 'defaultScore')],
        blocked: false,
      };
    }
  }
}
