// ⚠️ COPIE GENEREE — NE PAS MODIFIER ICI.
//
// La source est `lib/rapportSanteHtml.ts` a la racine du depot. Cette copie existe
// parce que le contexte de build Docker du web est `./web` : un import qui sort
// de ce dossier donne « module not found » dans le conteneur, alors qu'il passe
// en local. Constate en production le 17 aout 2026, deux deploiements de suite.
//
// `npm run sync:partage` regenere ce fichier, et un test compare les deux :
// s'ils divergent, la suite echoue. La duplication est donc impossible a laisser
// filer, ce qui etait tout l'enjeu — surtout pour le rapport medical.
// ───── fin de l'entete generee, la source commence ici ─────
// Rendu du rapport medecin — PUR, partage entre le telephone et le web.
// ---------------------------------------------------------------------------
// Extrait de `healthExport.ts`, qui importe la couche Firebase du MOBILE (donc
// AsyncStorage, absent d'un navigateur). Ici rien n'est touche : on prend des
// donnees, on rend une chaine.
//
// POURQUOI UN SEUL EXEMPLAIRE : c'est un rapport MEDICAL. Deux rendus qui
// divergent, ce sont deux documents differents remis au meme medecin — et
// personne ne s'en apercevrait avant que ca compte.
//
// Les types et `escapeHtml` viennent avec : ils decrivent la forme et
// l'echappement, pas la facon d'obtenir les donnees.

export const REPORT_DAYS = 30;

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

export function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function dayStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Résume une série numérique (déjà filtrée) — null si vide. */
export function summarize(values: number[]): VitalSummary | null {
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

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

export function conditionLabel(c: string): string {
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
