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

export const REPORT_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NutritionAverages {
  days: number;      // nb de jours distincts avec au moins un log
  calories: number;  // moyenne kcal/jour (nette : repas − activité)
  protein: number;   // g/jour
  carbs: number;     // g/jour
  fat: number;       // g/jour
  water: number;     // mL/jour
}

export interface VitalSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  latest: number;
}

export interface HealthReport {
  name: string;
  goal: string;
  weightKg: number | null;
  targetCalories: number | null;
  conditions: string[];
  nutrition: NutritionAverages;
  weightSeries: { date: string; kg: number }[]; // plus récent d'abord
  glucose: VitalSummary | null;
  bpSystolic: VitalSummary | null;
  bpDiastolic: VitalSummary | null;
  generatedAt: number; // ms epoch
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function dayStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Résume une série numérique (déjà filtrée) — null si vide. */
function summarize(values: number[]): VitalSummary | null {
  const vs = (values || []).filter((v) => Number.isFinite(v));
  if (!vs.length) return null;
  const sum = vs.reduce((s, v) => s + v, 0);
  return {
    count: vs.length,
    avg: Math.round((sum / vs.length) * 10) / 10,
    min: Math.round(Math.min(...vs) * 10) / 10,
    max: Math.round(Math.max(...vs) * 10) / 10,
    latest: Math.round(vs[0] * 10) / 10, // séries triées plus récent d'abord
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

export interface ReportLabels {
  title: string;
  subtitle: string; // ex "Récapitulatif santé — 30 derniers jours"
  profile: string;
  name: string;
  goal: string;
  weight: string;
  targetKcal: string;
  conditions: string;
  noConditions: string;
  nutrition: string;
  basedOn: string; // ex "Moyennes sur {n} jour(s) enregistré(s)"
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  weightTrend: string;
  glucose: string;
  bloodPressure: string;
  avg: string;
  min: string;
  max: string;
  latest: string;
  measures: string; // ex "mesures"
  none: string;
  disclaimer: string;
  generatedOn: string;
  locale: string; // ex 'fr-FR'
  rtl: boolean;
}

function conditionLabel(c: string): string {
  return String(c || '').replace(/_/g, ' ');
}

/** Construit le HTML complet du rapport (auto-suffisant, styles inline). */
export function buildReportHtml(r: HealthReport, L: ReportLabels): string {
  const dir = L.rtl ? 'rtl' : 'ltr';
  const gen = new Date(r.generatedAt).toLocaleDateString(L.locale);

  const row = (label: string, value: string) =>
    `<tr><td class="k">${escapeHtml(label)}</td><td class="v">${escapeHtml(value)}</td></tr>`;

  const vitalBlock = (title: string, s: VitalSummary | null, unit: string) => {
    if (!s) return '';
    return `
      <div class="vital">
        <div class="vh">${escapeHtml(title)}</div>
        <div class="vg">
          <span><b>${s.avg}</b> ${escapeHtml(L.avg)} ${escapeHtml(unit)}</span>
          <span>${escapeHtml(L.min)} ${s.min} · ${escapeHtml(L.max)} ${s.max}</span>
          <span>${escapeHtml(L.latest)} <b>${s.latest}</b></span>
          <span>${s.count} ${escapeHtml(L.measures)}</span>
        </div>
      </div>`;
  };

  const conditionsHtml = r.conditions.length
    ? r.conditions.map((c) => `<span class="chip">${escapeHtml(conditionLabel(c))}</span>`).join(' ')
    : `<span class="muted">${escapeHtml(L.noConditions)}</span>`;

  const weightRows = r.weightSeries
    .slice(0, 12)
    .map((w) => `<tr><td class="k">${escapeHtml(w.date)}</td><td class="v">${w.kg} kg</td></tr>`)
    .join('');

  const bpBlock =
    r.bpSystolic && r.bpDiastolic
      ? `
      <div class="vital">
        <div class="vh">${escapeHtml(L.bloodPressure)}</div>
        <div class="vg">
          <span><b>${r.bpSystolic.avg}/${r.bpDiastolic.avg}</b> ${escapeHtml(L.avg)} mmHg</span>
          <span>${escapeHtml(L.latest)} <b>${r.bpSystolic.latest}/${r.bpDiastolic.latest}</b></span>
          <span>${r.bpSystolic.count} ${escapeHtml(L.measures)}</span>
        </div>
      </div>`
      : '';

  const hasVitals = !!(r.glucose || (r.bpSystolic && r.bpDiastolic));

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${escapeHtml(L.locale.split('-')[0])}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0F172A; margin: 0; padding: 28px; direction: ${dir}; }
  h1 { font-size: 22px; margin: 0 0 2px; color: #2E8B57; }
  .sub { color: #64748B; font-size: 13px; margin: 0 0 22px; }
  section { margin-bottom: 22px; }
  h2 { font-size: 15px; border-bottom: 2px solid #2E8B57; padding-bottom: 4px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #EEF2F6; }
  td.k { color: #64748B; width: 45%; }
  td.v { font-weight: 700; text-align: ${L.rtl ? 'left' : 'right'}; }
  .basedOn { color: #94A3B8; font-size: 12px; margin: -4px 0 10px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .cell { flex: 1 1 30%; background: #F4F7F9; border-radius: 10px; padding: 12px; }
  .cell .n { font-size: 20px; font-weight: 800; color: #2E8B57; }
  .cell .l { font-size: 11px; color: #64748B; margin-top: 2px; }
  .chip { display: inline-block; background: #E6F4EC; color: #2E8B57; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; margin: 2px; }
  .muted { color: #94A3B8; font-size: 13px; }
  .vital { background: #F4F7F9; border-radius: 10px; padding: 12px; margin-bottom: 8px; }
  .vh { font-weight: 800; font-size: 13px; margin-bottom: 6px; }
  .vg { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: #334155; }
  .disc { background: #FEF3F2; border: 1px solid #FEE4E2; color: #B42318; border-radius: 10px; padding: 12px; font-size: 12px; line-height: 1.5; }
  .foot { color: #94A3B8; font-size: 11px; margin-top: 20px; }
</style></head>
<body>
  <h1>${escapeHtml(L.title)}</h1>
  <p class="sub">${escapeHtml(L.subtitle)}</p>

  <section>
    <h2>${escapeHtml(L.profile)}</h2>
    <table>
      ${row(L.name, r.name || '—')}
      ${r.goal ? row(L.goal, r.goal) : ''}
      ${r.weightKg != null ? row(L.weight, `${r.weightKg} kg`) : ''}
      ${r.targetCalories != null ? row(L.targetKcal, `${r.targetCalories} kcal`) : ''}
    </table>
  </section>

  <section>
    <h2>${escapeHtml(L.conditions)}</h2>
    <div>${conditionsHtml}</div>
  </section>

  <section>
    <h2>${escapeHtml(L.nutrition)}</h2>
    <p class="basedOn">${escapeHtml(L.basedOn.replace('{n}', String(r.nutrition.days)))}</p>
    <div class="grid">
      <div class="cell"><div class="n">${r.nutrition.calories}</div><div class="l">${escapeHtml(L.calories)}</div></div>
      <div class="cell"><div class="n">${r.nutrition.protein} g</div><div class="l">${escapeHtml(L.protein)}</div></div>
      <div class="cell"><div class="n">${r.nutrition.carbs} g</div><div class="l">${escapeHtml(L.carbs)}</div></div>
      <div class="cell"><div class="n">${r.nutrition.fat} g</div><div class="l">${escapeHtml(L.fat)}</div></div>
      <div class="cell"><div class="n">${r.nutrition.water} mL</div><div class="l">${escapeHtml(L.water)}</div></div>
    </div>
  </section>

  ${
    r.weightSeries.length
      ? `<section><h2>${escapeHtml(L.weightTrend)}</h2><table>${weightRows}</table></section>`
      : ''
  }

  ${
    hasVitals
      ? `<section><h2>${escapeHtml(L.glucose)} · ${escapeHtml(L.bloodPressure)}</h2>
          ${vitalBlock(L.glucose, r.glucose, 'mg/dL')}
          ${bpBlock}
        </section>`
      : ''
  }

  <section>
    <div class="disc">${escapeHtml(L.disclaimer)}</div>
  </section>

  <p class="foot">${escapeHtml(L.generatedOn)} ${escapeHtml(gen)} — SALORIE</p>
</body></html>`;
}

/** Version texte brut (fallback partage si expo-print/sharing indisponibles). */
export function buildReportText(r: HealthReport, L: ReportLabels): string {
  const gen = new Date(r.generatedAt).toLocaleDateString(L.locale);
  const lines: string[] = [];
  lines.push(`${L.title.toUpperCase()} — SALORIE`);
  lines.push(L.subtitle);
  lines.push('');
  lines.push(`## ${L.profile}`);
  lines.push(`${L.name}: ${r.name || '—'}`);
  if (r.goal) lines.push(`${L.goal}: ${r.goal}`);
  if (r.weightKg != null) lines.push(`${L.weight}: ${r.weightKg} kg`);
  if (r.targetCalories != null) lines.push(`${L.targetKcal}: ${r.targetCalories} kcal`);
  lines.push('');
  lines.push(`## ${L.conditions}`);
  lines.push(r.conditions.length ? r.conditions.map(conditionLabel).join(', ') : L.noConditions);
  lines.push('');
  lines.push(`## ${L.nutrition} (${L.basedOn.replace('{n}', String(r.nutrition.days))})`);
  lines.push(`${L.calories}: ${r.nutrition.calories}`);
  lines.push(`${L.protein}: ${r.nutrition.protein} g`);
  lines.push(`${L.carbs}: ${r.nutrition.carbs} g`);
  lines.push(`${L.fat}: ${r.nutrition.fat} g`);
  lines.push(`${L.water}: ${r.nutrition.water} mL`);
  if (r.weightSeries.length) {
    lines.push('');
    lines.push(`## ${L.weightTrend}`);
    for (const w of r.weightSeries.slice(0, 12)) lines.push(`${w.date}: ${w.kg} kg`);
  }
  if (r.glucose) {
    lines.push('');
    lines.push(`## ${L.glucose}`);
    lines.push(`${L.avg} ${r.glucose.avg} mg/dL · ${L.min} ${r.glucose.min} · ${L.max} ${r.glucose.max} · ${L.latest} ${r.glucose.latest} (${r.glucose.count} ${L.measures})`);
  }
  if (r.bpSystolic && r.bpDiastolic) {
    lines.push('');
    lines.push(`## ${L.bloodPressure}`);
    lines.push(`${L.avg} ${r.bpSystolic.avg}/${r.bpDiastolic.avg} mmHg · ${L.latest} ${r.bpSystolic.latest}/${r.bpDiastolic.latest} (${r.bpSystolic.count} ${L.measures})`);
  }
  lines.push('');
  lines.push(`⚠ ${L.disclaimer}`);
  lines.push('');
  lines.push(`${L.generatedOn} ${gen}`);
  return lines.join('\n');
}

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
