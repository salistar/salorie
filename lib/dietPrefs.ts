// Préférences de régime alimentaire (profils + HALAL).
// Stockage local opt-in dans AsyncStorage. Tout est DÉSACTIVÉ par défaut.
// Le helper dietPromptHint() produit une phrase à injecter dans un prompt IA
// (meal-plan, etc.) pour que la génération respecte les contraintes choisies.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'diet_prefs_v1';
/**
 * Copie de secours des SEULES contraintes booléennes.
 *
 * ⚠ POURQUOI UN SECOND ENREGISTREMENT POUR CINQ BOOLÉENS.
 * L'enregistrement principal porte aussi les conditions médicales et grossira
 * encore. Plus il est gros, plus une écriture interrompue ou une migration
 * ratée a de chances de le rendre illisible — et quand il l'est, on retombait
 * sur les défauts, c'est-à-dire `halal: false`. L'utilisateur recevait alors
 * des suggestions non halal sans qu'un écran ne l'ait prévenu.
 *
 * C'est la seule direction d'erreur qui fait manger à quelqu'un ce qu'il
 * refuse ; l'autre ne fait que rétrécir ses suggestions. Cette copie minuscule
 * — cinq booléens, rien d'autre — survit donc au principal, et sert de filet.
 * Ajoutée le 13/09/2026.
 */
const KEY_SECOURS = 'diet_prefs_secours_v1';

export type DietPref = {
  halal: boolean;
  vegetarian: boolean;
  keto: boolean;
  glutenFree: boolean;
  lowFodmap: boolean;
  // RÉGIME MÉDICAL — conditions de santé déclarées par l'utilisateur.
  // Valeurs gérées par le moteur objectif (voir lib/objective/scoring.ts) :
  //   'diabetes', 'hypertension', 'high_cholesterol', 'celiac',
  //   'kidney', 'ibs' | 'lowfodmap', 'gout'.
  // Guidance diététique conservatrice, PAS un diagnostic médical.
  // TODO(onboarding): ajouter un écran pour SAISIR ces conditions (multi-select).
  //   Ne PAS construire l'UI ici — ce champ est seulement la source de données.
  conditions: string[];
};

const DEFAULT_PREFS: DietPref = {
  halal: false,
  vegetarian: false,
  keto: false,
  glutenFree: false,
  lowFodmap: false,
  conditions: [],
};

/**
 * Lit une contrainte stockée, du côté qui PROTÈGE.
 *
 * ⚠ `{...DEFAUTS, ...parsed}` écrasait le défaut par la valeur stockée, quelle
 * qu'elle soit : un `halal: null` — écriture interrompue, migration ratée —
 * devenait faux, et l'utilisateur recevait des suggestions non halal sans qu'un
 * écran ne l'ait prévenu. C'est la seule direction d'erreur qui fait manger à
 * quelqu'un ce qu'il refuse ; l'autre ne fait que rétrécir ses suggestions.
 *
 * On lit donc large : tout ce qui a été enregistré comme une intention
 * positive — `true`, `'true'`, `1` — vaut la contrainte. Seuls une ABSENCE
 * franche (`undefined`, clé jamais écrite) ou un refus explicite (`false`,
 * `'false'`, `0`) la lèvent. Corrigé le 13/09/2026.
 */
function lireContrainte(v: unknown, defaut: boolean): boolean {
  if (v === undefined) return defaut;
  if (typeof v === 'boolean') return v;
  if (v === null) return defaut;      // valeur perdue : on garde le défaut
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'false' || t === '0' || t === '') return false;
    return true;                      // toute autre chaîne = intention positive
  }
  if (typeof v === 'number') return v !== 0;
  return defaut;
}

/** Les cinq contraintes, relues depuis la copie de secours. Jamais d'exception. */
async function lireSecours(): Promise<Partial<DietPref>> {
  try {
    const brut = await AsyncStorage.getItem(KEY_SECOURS);
    if (!brut) return {};
    const o = JSON.parse(brut);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return o as Partial<DietPref>;
  } catch {
    return {};
  }
}

export async function getDietPrefs(): Promise<DietPref> {
  const secours = await lireSecours();
  // Le filet devient le défaut : si le principal ne dit rien d'une contrainte,
  // c'est la copie qui parle, et seulement à défaut le `false` d'origine.
  const DEFAUTS: DietPref = {
    ...DEFAULT_PREFS,
    halal: lireContrainte(secours.halal, DEFAULT_PREFS.halal),
    vegetarian: lireContrainte(secours.vegetarian, DEFAULT_PREFS.vegetarian),
    keto: lireContrainte(secours.keto, DEFAULT_PREFS.keto),
    glutenFree: lireContrainte(secours.glutenFree, DEFAULT_PREFS.glutenFree),
    lowFodmap: lireContrainte(secours.lowFodmap, DEFAULT_PREFS.lowFodmap),
  };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAUTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAUTS };
    }
    const p = parsed as Record<string, unknown>;
    return {
      halal: lireContrainte(p.halal, DEFAUTS.halal),
      vegetarian: lireContrainte(p.vegetarian, DEFAUTS.vegetarian),
      keto: lireContrainte(p.keto, DEFAUTS.keto),
      glutenFree: lireContrainte(p.glutenFree, DEFAUTS.glutenFree),
      lowFodmap: lireContrainte(p.lowFodmap, DEFAUTS.lowFodmap),
      // Les conditions médicales restent une liste de chaînes, et rien d'autre :
      // le moteur objectif les compare telles quelles.
      conditions: Array.isArray(p.conditions)
        ? p.conditions.filter((c): c is string => typeof c === 'string')
        : [],
    };
  } catch {
    return { ...DEFAUTS };
  }
}

export async function setDietPrefs(p: DietPref): Promise<void> {
  // Les deux écritures sont indépendantes : si la grosse échoue, le filet doit
  // quand même être posé — c'est précisément le cas qu'il sert à rattraper.
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* best-effort */
  }
  try {
    await AsyncStorage.setItem(KEY_SECOURS, JSON.stringify({
      halal: !!p?.halal,
      vegetarian: !!p?.vegetarian,
      keto: !!p?.keto,
      glutenFree: !!p?.glutenFree,
      lowFodmap: !!p?.lowFodmap,
    }));
  } catch {
    /* best-effort */
  }
}

// Contraintes booléennes exposées dans la phrase injectée dans le prompt IA.
// (Les `conditions` médicales sont gérées par le moteur objectif, pas ici.)
type BoolPref = 'halal' | 'vegetarian' | 'keto' | 'glutenFree' | 'lowFodmap';

// Libellés des contraintes par langue, pour la phrase injectée dans le prompt IA.
const LABELS: Record<string, Record<BoolPref, string>> = {
  en: {
    halal: 'halal',
    vegetarian: 'vegetarian',
    keto: 'ketogenic (low-carb)',
    glutenFree: 'gluten-free',
    lowFodmap: 'low-FODMAP',
  },
  fr: {
    halal: 'halal',
    vegetarian: 'végétarien',
    keto: 'cétogène (pauvre en glucides)',
    glutenFree: 'sans gluten',
    lowFodmap: 'pauvre en FODMAP',
  },
  ar: {
    halal: 'حلال',
    vegetarian: 'نباتي',
    keto: 'كيتوني (قليل الكربوهيدرات)',
    glutenFree: 'خالٍ من الغلوتين',
    lowFodmap: 'قليل الفودماب',
  },
};

const LEAD: Record<string, string> = {
  en: 'Respect these dietary constraints:',
  fr: 'Respecte ces contraintes alimentaires :',
  ar: 'احترم هذه القيود الغذائية:',
};

/**
 * Construit une phrase de contraintes à injecter dans un prompt IA.
 * Renvoie '' si aucune préférence n'est activée.
 * Ex (fr) : "Respecte ces contraintes alimentaires : halal, sans gluten."
 */
export function dietPromptHint(p: DietPref, language: string = 'en'): string {
  const labels = LABELS[language] || LABELS.en;
  const lead = LEAD[language] || LEAD.en;
  const keys: BoolPref[] = ['halal', 'vegetarian', 'keto', 'glutenFree', 'lowFodmap'];
  // `=== true` plutot que la simple verite : l'appelant peut passer un objet
  // reconstruit a la main, et une chaine non vide ne doit pas devenir une
  // contrainte par accident ici — la tolerance vit dans `getDietPrefs`, ou elle
  // est justifiee et commentee, pas dans le gabarit de prompt.
  const active = keys.filter((k) => !!p && p[k] === true).map((k) => labels[k]);
  if (active.length === 0) return '';
  const sep = language === 'ar' ? '، ' : ', ';
  return `${lead} ${active.join(sep)}.`;
}
