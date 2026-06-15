// Calcul d'insights ON-DEVICE (tier 1 de la cascade analytics : LOCAL → BACKEND → GEMINI).
// 100% hors-ligne, gratuit : régression linéaire pour la prévision de poids + scoring
// macro pour la reco repas. Si les données locales sont insuffisantes, l'appelant
// bascule sur le backend (/ml) puis sur Gemini. Aligné sur les types de lib/mlApi.ts.
import type { WeightForecast, MealReco } from './mlApi';

type WeightPoint = { weight: number; timestamp?: number; date?: string };

const MS_WEEK = 7 * 24 * 3600 * 1000;

function toTs(p: WeightPoint): number {
  if (typeof p.timestamp === 'number') return p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000;
  if (p.date) { const t = Date.parse(p.date); if (!isNaN(t)) return t; }
  return 0;
}

/**
 * Prévision de poids locale par régression linéaire des moindres carrés sur (temps, poids).
 * Renvoie {ok:false} si < 3 points exploitables → l'appelant tente le backend.
 */
export function localWeightForecast(history: WeightPoint[], targetWeight?: number): WeightForecast {
  const pts = (history || [])
    .map((p) => ({ t: toTs(p), w: Number(p.weight) }))
    .filter((p) => p.t > 0 && isFinite(p.w) && p.w > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return { ok: false, reason: 'not_enough_local_data', model: 'local' };

  // Régression linéaire : w = a + b*t  (t en semaines depuis le 1er point)
  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / MS_WEEK);
  const ys = pts.map((p) => p.w);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxx === 0 ? 0 : sxy / sxx;          // kg / semaine (tendance globale)
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  // Tendance récente : moitié la plus récente vs la moitié ancienne (kg/sem).
  const half = Math.max(1, Math.floor(n / 2));
  const recent = ys.slice(n - half);
  const older = ys.slice(0, half);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
  const spanWeeks = Math.max((pts[n - 1].t - pts[0].t) / MS_WEEK, 0.5);
  const recentKgPerWeek = (recentAvg - olderAvg) / (spanWeeks / 2);

  const current = ys[n - 1];
  const direction: WeightForecast['direction'] =
    Math.abs(slope) < 0.05 ? 'stable' : slope < 0 ? 'losing' : 'gaining';
  const plateau = Math.abs(recentKgPerWeek) < 0.1 && n >= 4;
  const confidence = Math.max(0.2, Math.min(0.95, r2 * (n >= 6 ? 1 : 0.7)));

  let projection: WeightForecast['projection'] = null;
  if (targetWeight != null && Math.abs(slope) > 0.02) {
    const weeks = (targetWeight - current) / slope;
    if (weeks > 0 && weeks < 520) {
      projection = {
        targetWeight,
        daysToGoal: Math.round(weeks * 7),
        etaTs: pts[n - 1].t + weeks * MS_WEEK,
        weeklyRate: Math.round(slope * 100) / 100,
      };
    }
  }

  return {
    ok: true, model: 'local-regression', count: n, currentWeight: Math.round(current * 10) / 10,
    trendKgPerWeek: Math.round(slope * 100) / 100, recentKgPerWeek: Math.round(recentKgPerWeek * 100) / 100,
    direction, plateau, confidence: Math.round(confidence * 100) / 100, projection,
  };
}

// Petite base d'aliments embarquée (macros / 100g sauf portions usuelles) pour la reco
// locale. Choisie « santé / Maroc-friendly », haute densité protéique en tête.
const LOCAL_FOODS: { name: string; kcal: number; p: number; c: number; f: number; tags: string[] }[] = [
  { name: 'Blanc de poulet grillé', kcal: 165, p: 31, c: 0, f: 3.6, tags: ['high-protein', 'lean'] },
  { name: 'Filet de saumon', kcal: 208, p: 20, c: 0, f: 13, tags: ['high-protein', 'omega3'] },
  { name: 'Thon (au naturel)', kcal: 116, p: 26, c: 0, f: 1, tags: ['high-protein', 'lean'] },
  { name: 'Œufs', kcal: 155, p: 13, c: 1.1, f: 11, tags: ['high-protein', 'breakfast'] },
  { name: 'Lentilles cuites', kcal: 116, p: 9, c: 20, f: 0.4, tags: ['fiber', 'veg'] },
  { name: 'Pois chiches', kcal: 164, p: 9, c: 27, f: 2.6, tags: ['fiber', 'veg'] },
  { name: 'Yaourt grec nature', kcal: 59, p: 10, c: 3.6, f: 0.4, tags: ['high-protein', 'snack'] },
  { name: 'Fromage blanc 0%', kcal: 47, p: 8, c: 4, f: 0.2, tags: ['high-protein', 'snack'] },
  { name: 'Riz complet cuit', kcal: 112, p: 2.6, c: 24, f: 0.9, tags: ['carb'] },
  { name: 'Flocons d’avoine', kcal: 389, p: 17, c: 66, f: 7, tags: ['carb', 'breakfast', 'fiber'] },
  { name: 'Patate douce', kcal: 86, p: 1.6, c: 20, f: 0.1, tags: ['carb', 'fiber'] },
  { name: 'Amandes', kcal: 579, p: 21, c: 22, f: 50, tags: ['fat', 'snack'] },
  { name: 'Avocat', kcal: 160, p: 2, c: 9, f: 15, tags: ['fat', 'fiber'] },
  { name: 'Brocoli', kcal: 34, p: 2.8, c: 7, f: 0.4, tags: ['veg', 'fiber'] },
  { name: 'Viande hachée 5%', kcal: 137, p: 21, c: 0, f: 5, tags: ['high-protein'] },
];

/**
 * Reco repas locale : score chaque aliment par adéquation aux macros restantes du jour
 * et à l'objectif (lose = +densité protéique/-kcal, gain = +kcal/+protéines). Hors-ligne.
 */
export function localMealReco(
  remaining: { kcal: number; p: number; c: number; f: number },
  goal: 'lose' | 'maintain' | 'gain' = 'maintain',
  limit = 3,
): MealReco {
  const rem = {
    kcal: Math.max(0, Number(remaining?.kcal) || 0),
    p: Math.max(0, Number(remaining?.p) || 0),
    c: Math.max(0, Number(remaining?.c) || 0),
    f: Math.max(0, Number(remaining?.f) || 0),
  };
  const scored = LOCAL_FOODS.map((food) => {
    const proteinDensity = food.p / Math.max(food.kcal, 1);     // g protéine / kcal
    let score = proteinDensity * 100;                            // base : qualité protéique
    if (goal === 'lose') score += (food.tags.includes('lean') ? 20 : 0) - food.f * 0.3;
    if (goal === 'gain') score += food.kcal * 0.02 + food.p * 0.5;
    if (rem.p > 0 && food.p >= 15) score += 10;                  // il reste des protéines à atteindre
    if (rem.c < 30 && food.tags.includes('carb')) score -= 15;   // peu de glucides restants
    return { name: food.name, kcal: food.kcal, p: food.p, c: food.c, f: food.f,
             score: Math.round(score * 10) / 10, proteinDensity: Math.round(proteinDensity * 1000) / 1000, tags: food.tags };
  }).sort((a, b) => b.score - a.score).slice(0, limit);

  return { ok: true, goal, remaining: rem, recommendations: scored };
}
