// Assemble un ObjectiveContext (état nutritionnel du jour + contraintes user)
// à partir des sources existantes de l'app. AUCUNE logique de scoring ici —
// on ne fait que collecter et normaliser les données pour scoreFood / le backend.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserFromFirestore } from '../firebase';
import { getDietPrefs } from '../dietPrefs';
import type { ObjectiveContext, ScoreLang } from './scoring';

/** goals/consumed tels que fournis par le hook useNutritionData(date). */
export interface NutritionDataSlice {
  goals?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  consumed?: { calories?: number; protein?: number; carbs?: number; fat?: number };
}

/** Nombre fini >= 0, sinon défaut. */
function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/** Mappe le goal stocké en Firestore vers l'union attendue par le scoring. */
function normGoal(goal: unknown): 'lose' | 'maintain' | 'gain' {
  const g = String(goal ?? '').toLowerCase().trim();
  if (g === 'lose' || g === 'gain' || g === 'maintain') return g;
  // Tolère d'anciens libellés éventuels.
  if (g.includes('lose') || g.includes('lost') || g.includes('perd')) return 'lose';
  if (g.includes('gain') || g.includes('prise') || g.includes('mass')) return 'gain';
  return 'maintain';
}

/**
 * Construit le contexte d'objectif du jour pour le scoring on-device et les
 * analyses backend (menu/fridge/receipt). Défauts sûrs si données absentes.
 *
 * - goal + plan macro : depuis getUserFromFirestore (nutritionalPlan).
 * - goals/consumed : depuis nutritionData (hook useNutritionData) si fourni,
 *   sinon repli sur le plan Firestore (consumed = 0).
 * - diet : depuis getDietPrefs (halal→'halal', vegetarian→'vegetarian', ...).
 * - allergies/dislikes : [] (pas encore stockés).
 *
 * remainingKcal/remainingMacros = max(0, cible - consommé).
 */
/**
 * Langue de l'application, lue a la meme cle que lib/i18n.tsx.
 *
 * C'est ici que la langue entre dans le scoring, et nulle part ailleurs : les huit
 * ecrans qui appellent scoreFood passent tous par ce constructeur de contexte. Les
 * traduire un par un aurait garanti d'en oublier — et un oubli ne se voit pas, il rend
 * simplement un conseil de sante en francais a quelqu'un qui ne le lit pas.
 *
 * Lecture best-effort : un echec retombe sur le francais, comportement historique.
 */
async function readLang(): Promise<ScoreLang> {
  try {
    const v = await AsyncStorage.getItem('app_language');
    return v === 'en' || v === 'ar' || v === 'fr' ? v : 'fr';
  } catch {
    return 'fr';
  }
}

export async function buildObjectiveContext(
  email: string,
  clerkId?: string,
  todayDate?: string,
  nutritionData?: NutritionDataSlice,
): Promise<ObjectiveContext> {
  // Défauts sûrs si tout échoue.
  let goal: 'lose' | 'maintain' | 'gain' = 'maintain';
  let uid: string | undefined = email || clerkId || undefined;

  // Plan macro depuis Firestore (best-effort).
  let planKcal = 0;
  let planProtein = 0;
  let planCarbs = 0;
  let planFat = 0;
  try {
    const profile = await getUserFromFirestore(email, clerkId);
    if (profile) {
      goal = normGoal(profile.goal);
      uid = email || (profile as any).id || clerkId || undefined;
      const plan = profile.nutritionalPlan || {};
      planKcal = num(plan.dailyCalories, 0);
      planProtein = num(plan.proteins, 0);
      planCarbs = num(plan.carbs, 0);
      planFat = num(plan.fats, 0);
    }
  } catch {
    /* défauts sûrs conservés */
  }

  // Préférences de régime + conditions médicales (best-effort).
  const diet: string[] = [];
  let conditions: string[] = [];
  try {
    const prefs = await getDietPrefs();
    if (prefs.halal) diet.push('halal');
    if (prefs.vegetarian) diet.push('vegetarian');
    if (prefs.keto) diet.push('keto');
    // Conditions médicales déclarées (ex: 'diabetes', 'hypertension', ...).
    // Le moteur de scoring applique pénalités/blocages + reason "à confirmer
    // avec ton médecin". Guidance diététique, PAS un diagnostic.
    conditions = Array.isArray(prefs.conditions) ? [...prefs.conditions] : [];
    // Régimes à effet médical : mappés en conditions pour que le moteur les
    // applique réellement (sans-gluten → cœliaque = blocage dur gluten ;
    // low-FODMAP → pénalité FODMAP). Avant, poussés dans `diet` sans effet.
    if (prefs.glutenFree && !conditions.includes('celiac')) conditions.push('celiac');
    if (prefs.lowFodmap && !conditions.includes('lowfodmap')) conditions.push('lowfodmap');
  } catch {
    /* aucun régime / aucune condition */
  }

  // Cibles du jour : on privilégie le hook useNutritionData (déjà résolu) ;
  // sinon on retombe sur le plan Firestore.
  const g = nutritionData?.goals || {};
  const cons = nutritionData?.consumed || {};

  const dailyKcalTarget = num(g.calories, planKcal);
  const targetProtein = num(g.protein, planProtein);
  const targetCarbs = num(g.carbs, planCarbs);
  const targetFat = num(g.fat, planFat);

  const consumedKcal = num(cons.calories, 0);
  const consumedProtein = num(cons.protein, 0);
  const consumedCarbs = num(cons.carbs, 0);
  const consumedFat = num(cons.fat, 0);

  const remainingKcal = Math.max(0, dailyKcalTarget - consumedKcal);
  const remainingMacros = {
    protein: Math.max(0, targetProtein - consumedProtein),
    carbs: Math.max(0, targetCarbs - consumedCarbs),
    fat: Math.max(0, targetFat - consumedFat),
  };

  const lang = await readLang();

  return {
    uid,
    lang,
    goal,
    // TDEE non requis ici ; le budget du jour est porté par dailyKcalTarget.
    tdee: dailyKcalTarget,
    dailyKcalTarget,
    remainingKcal,
    macroTargets: {
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
    },
    remainingMacros,
    diet,
    allergies: [],
    dislikes: [],
    conditions,
  };
}
