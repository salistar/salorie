// RAPPORT MÉDECIN (PDF) — agrège 30 jours de données santé en un récap
// destiné à un professionnel de santé.
//
// Sources :
//  - Profil : getUserFromFirestore (nom, objectif, poids, plan nutritionnel).
//  - Conditions médicales : dietPrefs.conditions (AsyncStorage, opt-in).
//  - Nutrition : getNutritionLogs sur 30 jours → moyennes kcal / macros / eau.
//  - Poids : getEntries('weight_history').
//  - Glycémie / tension : lib/vitals (import OPTIONNEL — try/catch : si le module
//    est absent, la section est simplement omise).
//
// Génération :
//  - PDF via expo-print (printToFileAsync) + partage via expo-sharing, tous deux
//    chargés en require() OPTIONNEL. Si absents des deps → fallback : on renvoie
//    le texte brut et l'écran le partage via Share (RN core).
//
// Guidance conservatrice, PAS un diagnostic. Aucune donnée ne quitte l'appareil
// autrement que par le partage explicite déclenché par l'utilisateur.

import { getUserFromFirestore, getNutritionLogs, NutritionLog } from './firebase';
import { getEntries } from './tracking';
import { getDietPrefs } from './dietPrefs';
// Le RENDU vit dans un module pur, partage avec le web : un rapport medical ne
// doit pas exister en deux versions qui divergent.
import { REPORT_DAYS, escapeHtml, num, dayStr, summarize, conditionLabel, buildReportHtml, buildReportText } from './rapportSanteHtml';
import type { HealthReport, ReportLabels, NutritionAverages, VitalSummary } from './rapportSanteHtml';
export { REPORT_DAYS, buildReportHtml, buildReportText } from './rapportSanteHtml';
export type { HealthReport, ReportLabels, NutritionAverages, VitalSummary } from './rapportSanteHtml';


// ---------------------------------------------------------------------------
// Agrégation (30 jours)
// ---------------------------------------------------------------------------

/**
 * Construit le rapport santé des `days` derniers jours pour l'email donné.
 * Best-effort : chaque source est protégée, un échec isolé n'empêche pas le
 * reste (les sections vides sont simplement omises à l'affichage).
 */
export async function buildHealthReport(
  email: string,
  userId?: string,
  days = REPORT_DAYS,
): Promise<HealthReport> {
  const now = Date.now();
  const sinceStr = dayStr(now - days * 24 * 60 * 60 * 1000);

  // 1. Profil
  let profile: any = null;
  try {
    profile = await getUserFromFirestore(email, userId);
  } catch {
    /* best-effort */
  }
  const name =
    profile?.firstName ||
    (email ? email.split('@')[0] : '') ||
    '';
  const goal = profile?.goal || profile?.objective || '';
  const weightKg = num(profile?.weight) > 0 ? num(profile.weight) : null;
  const targetCalories =
    num(profile?.nutritionalPlan?.dailyCalories) > 0
      ? num(profile.nutritionalPlan.dailyCalories)
      : null;

  // 2. Conditions médicales (opt-in, local)
  let conditions: string[] = [];
  try {
    const prefs = await getDietPrefs();
    conditions = Array.isArray(prefs?.conditions) ? prefs.conditions : [];
  } catch {
    /* best-effort */
  }

  // 3. Nutrition — 30 jours de logs, agrégés par jour puis moyennés.
  const nutrition = await buildNutritionAverages(email, days);

  // 4. Poids
  let weightSeries: { date: string; kg: number }[] = [];
  try {
    const rows = await getEntries(email, 'weight_history', 60);
    weightSeries = rows
      .map((w: any) => ({ date: String(w.date || ''), kg: num(w.weight) }))
      .filter((w) => w.kg > 0 && w.date >= sinceStr);
  } catch {
    /* best-effort */
  }

  // 5. Glycémie / tension — import OPTIONNEL de lib/vitals.
  let glucose: VitalSummary | null = null;
  let bpSystolic: VitalSummary | null = null;
  let bpDiastolic: VitalSummary | null = null;
  try {
    // require dynamique : si le module n'existe pas, on tombe dans le catch.
    const vitals = require('./vitals');
    if (vitals?.listGlucose) {
      const g = await vitals.listGlucose(email, days);
      glucose = summarize((g || []).map((e: any) => num(e.mgdl)).filter((v: number) => v > 0));
    }
    if (vitals?.listBP) {
      const bp = await vitals.listBP(email, days);
      bpSystolic = summarize((bp || []).map((e: any) => num(e.systolic)).filter((v: number) => v > 0));
      bpDiastolic = summarize((bp || []).map((e: any) => num(e.diastolic)).filter((v: number) => v > 0));
    }
  } catch {
    /* module vitals absent ou lecture échouée — sections omises */
  }

  return {
    name,
    goal,
    weightKg,
    targetCalories,
    conditions,
    nutrition,
    weightSeries,
    glucose,
    bpSystolic,
    bpDiastolic,
    generatedAt: now,
  };
}

/**
 * Moyennes nutrition sur `days` jours. On parcourt chaque jour, on récupère ses
 * logs (getNutritionLogs), on agrège en un total journalier (repas − activité,
 * eau à part) puis on moyenne sur les jours ayant au moins un log.
 */
async function buildNutritionAverages(email: string, days: number): Promise<NutritionAverages> {
  const empty: NutritionAverages = { days: 0, calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
  if (!email) return empty;

  const perDay: { calories: number; protein: number; carbs: number; fat: number; water: number }[] = [];
  const now = Date.now();

  for (let i = 0; i < days; i++) {
    const ds = dayStr(now - i * 24 * 60 * 60 * 1000);
    let logs: NutritionLog[] = [];
    try {
      logs = await getNutritionLogs(email, ds);
    } catch {
      logs = [];
    }
    if (!logs || logs.length === 0) continue;

    const total = logs.reduce(
      (acc, log: any) => {
        if (log.type === 'activity') {
          acc.calories -= num(log.calories);
        } else if (log.type === 'water') {
          acc.water += num(log.calories);
        } else {
          acc.calories += num(log.calories);
          acc.protein += num(log.protein);
          acc.carbs += num(log.carbs);
          acc.fat += num(log.fat);
        }
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    );
    perDay.push(total);
  }

  const n = perDay.length;
  if (!n) return empty;
  const sum = perDay.reduce(
    (a, d) => ({
      calories: a.calories + d.calories,
      protein: a.protein + d.protein,
      carbs: a.carbs + d.carbs,
      fat: a.fat + d.fat,
      water: a.water + d.water,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
  );
  return {
    days: n,
    calories: Math.round(sum.calories / n),
    protein: Math.round(sum.protein / n),
    carbs: Math.round(sum.carbs / n),
    fat: Math.round(sum.fat / n),
    water: Math.round(sum.water / n),
  };
}

// ---------------------------------------------------------------------------
// Rendu HTML (pour le PDF) — libellés fournis par l'écran (i18n).
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Génération + partage (PDF si dispo, sinon texte)
// ---------------------------------------------------------------------------

export interface GenerateResult {
  mode: 'pdf' | 'text';
  /** URI du PDF si mode==='pdf'. */
  uri?: string;
  /** Texte partagé si mode==='text'. */
  text?: string;
}

/**
 * Génère le rapport et le partage.
 *  - Si expo-print + expo-sharing sont dispos → PDF + feuille de partage native.
 *  - Sinon → renvoie le texte pour que l'écran le partage via Share (RN core).
 * `shareTitle` est le titre de la feuille de partage OS.
 */
export async function generateAndShareReport(
  html: string,
  text: string,
  shareTitle: string,
): Promise<GenerateResult> {
  // expo-print — require optionnel.
  let Print: any = null;
  try {
    Print = require('expo-print');
  } catch {
    Print = null;
  }

  if (Print?.printToFileAsync) {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      // expo-sharing — require optionnel.
      let Sharing: any = null;
      try {
        Sharing = require('expo-sharing');
      } catch {
        Sharing = null;
      }
      if (Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: shareTitle,
          UTI: 'com.adobe.pdf',
        });
      }
      return { mode: 'pdf', uri };
    } catch {
      /* échec PDF → on retombe sur le texte ci-dessous */
    }
  }

  // Fallback texte — l'écran fera le Share.share lui-même.
  return { mode: 'text', text };
}
