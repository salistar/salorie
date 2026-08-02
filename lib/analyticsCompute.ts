// Calculs PURS extraits d'app/(tabs)/analytics.tsx (god-component) → testables
// unitairement, réutilisables, et le composant rétrécit. Aucun changement de comportement.

export interface WeightTrend {
  direction: 'rising' | 'falling' | 'stable';
  good: boolean;
  delta: number;
}

/**
 * Tendance de poids : moyenne de la moitié récente vs la moitié ancienne
 * (robuste à une pesée bruitée). `weightHistory` ordonné du plus RÉCENT au plus ancien.
 * null si < 2 pesées. `good` juge la direction selon l'objectif.
 */
export function computeWeightTrend(
  weightHistory: Array<{ weight?: number | null }>,
  goal?: 'lose' | 'maintain' | 'gain' | string,
): WeightTrend | null {
  const series = weightHistory
    .map((w) => (typeof w?.weight === 'number' ? w.weight : null))
    .filter((w): w is number => w != null);
  if (series.length < 2) return null;

  const recentFirst = series; // newest → oldest
  const half = Math.max(1, Math.floor(recentFirst.length / 2));
  const recentAvg = recentFirst.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const olderSlice = recentFirst.slice(recentFirst.length - half);
  const olderAvg = olderSlice.reduce((a, b) => a + b, 0) / olderSlice.length;
  const delta = recentAvg - olderAvg; // >0 rising, <0 falling

  const direction: WeightTrend['direction'] =
    Math.abs(delta) < 0.3 ? 'stable' : delta > 0 ? 'rising' : 'falling';

  let good: boolean;
  if (goal === 'lose') good = direction === 'falling';
  else if (goal === 'gain') good = direction === 'rising';
  else good = direction === 'stable'; // maintain

  return { direction, good, delta };
}

export interface WeekDay {
  consumedCalories: number;
  burnedCalories: number;
  waterConsumed: number;
  hasActivity: boolean;
}

/** Agrégats hebdo (consommé / brûlé / eau / streak de jours actifs) à partir des jours. */
export function summarizeWeek(days: WeekDay[]) {
  return {
    totalConsumed: days.reduce((a, d) => a + (d.consumedCalories || 0), 0),
    totalBurned: days.reduce((a, d) => a + (d.burnedCalories || 0), 0),
    totalWater: days.reduce((a, d) => a + (d.waterConsumed || 0), 0),
    activeDays: days.filter((d) => d.hasActivity).length,
  };
}
