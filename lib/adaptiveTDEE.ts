// TDEE adaptatif auto-recalibré (façon MacroFactor) — 100% logiciel, basé sur
// les VRAIES données : intake quotidien loggé + tendance de poids (régression).
//
// Principe : sur une fenêtre glissante (par défaut 21 j), on connaît l'apport
// moyen réel (avgIntake) et la pente de poids (kg/jour, régression linéaire =
// robuste au bruit des pesées). L'énergie stockée/déstockée = pente × 7700 kcal/kg.
//   TDEE_réel = avgIntake − (pente_kg_par_jour × 7700)
// Si on perd du poids (pente < 0) → TDEE > apport (on brûle plus qu'on mange).
// Recalculé à chaque ouverture sur la fenêtre récente → "auto-recalibré".

const KCAL_PER_KG = 7700;

const toMs = (t: any): number => {
  if (typeof t === 'number') return t;
  if (!t) return 0;
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t.toMillis === 'function') return t.toMillis();
  const p = Date.parse(t); return isNaN(p) ? 0 : p;
};

// Pente (unité y / unité x) par moindres carrés.
function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-9) return 0;
  return (n * sxy - sx * sy) / d;
}

export interface AdaptiveResult {
  tdee: number | null;            // maintenance apprise (kcal/j) — null si pas assez de données
  avgIntake: number;              // apport moyen réel sur la fenêtre (kcal/j)
  intakeDays: number;             // nb de jours de repas loggés exploités
  weighIns: number;               // nb de pesées exploitées
  spanDays: number;               // étendue temporelle des pesées (j)
  trendKgPerWeek: number;         // tendance de poids (kg/sem ; négatif = perte)
  confidence: 'low' | 'medium' | 'high';
  recommendedTarget: number | null; // cible quotidienne conseillée selon l'objectif
  note: string;
}

export function computeAdaptiveTDEE(
  logs: { calories?: number; timestamp?: any }[],
  weights: { weight?: number; timestamp?: any }[],
  goal?: string,
  windowDays = 21,
): AdaptiveResult {
  const cutoff = Date.now() - windowDays * 86400000;

  // Apport quotidien (somme des kcal par jour), on ignore les jours quasi vides.
  const byDay: Record<string, number> = {};
  for (const l of logs) {
    const ms = toMs(l.timestamp);
    if (!ms || ms < cutoff) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (Number(l.calories) || 0);
  }
  const dayKeys = Object.keys(byDay).filter((d) => byDay[d] > 200);
  const intakeDays = dayKeys.length;
  const avgIntake = intakeDays ? Math.round(dayKeys.reduce((a, d) => a + byDay[d], 0) / intakeDays) : 0;

  // Pesées dans la fenêtre, triées, régression en jours.
  const wp = weights
    .map((w) => ({ x: toMs(w.timestamp), y: Number(w.weight) }))
    .filter((p) => p.x >= cutoff && p.y > 0)
    .sort((a, b) => a.x - b.x);
  const spanDays = wp.length >= 2 ? (wp[wp.length - 1].x - wp[0].x) / 86400000 : 0;
  const slopeKgPerDay = wp.length >= 2 ? slope(wp.map((p) => ({ x: p.x / 86400000, y: p.y }))) : 0;
  const trendKgPerWeek = Math.round(slopeKgPerDay * 7 * 100) / 100;

  // Pas assez de données → on reste honnête (pas de TDEE inventé).
  if (intakeDays < 7 || wp.length < 2 || spanDays < 7) {
    return {
      tdee: null, avgIntake, intakeDays, weighIns: wp.length, spanDays: Math.round(spanDays),
      trendKgPerWeek, confidence: 'low', recommendedTarget: null,
      note: `Besoin d'au moins ~7 jours de repas loggés + 2 pesées espacées de 7 j. (${intakeDays} j de repas, ${wp.length} pesées sur ${Math.round(spanDays)} j)`,
    };
  }

  const tdee = Math.round(avgIntake - slopeKgPerDay * KCAL_PER_KG);
  const confidence: AdaptiveResult['confidence'] = intakeDays >= 14 && spanDays >= 14 ? 'high' : 'medium';

  let recommendedTarget = tdee;
  if (goal === 'lose') recommendedTarget = tdee - 500;      // ≈ -0,45 kg/sem
  else if (goal === 'gain') recommendedTarget = tdee + 300; // ≈ +0,27 kg/sem
  recommendedTarget = Math.max(1200, Math.round(recommendedTarget / 10) * 10);

  return {
    tdee, avgIntake, intakeDays, weighIns: wp.length, spanDays: Math.round(spanDays),
    trendKgPerWeek, confidence, recommendedTarget,
    note: `Recalibré sur ${intakeDays} j de repas et ${wp.length} pesées (${Math.round(spanDays)} j).`,
  };
}
