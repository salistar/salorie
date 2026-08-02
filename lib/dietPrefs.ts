// Préférences de régime alimentaire (profils + HALAL).
// Stockage local opt-in dans AsyncStorage. Tout est DÉSACTIVÉ par défaut.
// Le helper dietPromptHint() produit une phrase à injecter dans un prompt IA
// (meal-plan, etc.) pour que la génération respecte les contraintes choisies.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'diet_prefs_v1';

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

export async function getDietPrefs(): Promise<DietPref> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    // Merge sur les défauts : tolère un objet partiel / une ancienne version.
    return { ...DEFAULT_PREFS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setDietPrefs(p: DietPref): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
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
  const active = keys.filter((k) => p && p[k]).map((k) => labels[k]);
  if (active.length === 0) return '';
  const sep = language === 'ar' ? '، ' : ', ';
  return `${lead} ${active.join(sep)}.`;
}
