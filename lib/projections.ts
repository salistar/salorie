// Calculs partagés (jumeau métabolique, budget calories, time-to-goal).
// Estimations simples, transparentes, basées sur le profil — clairement libellées.

const KCAL_PER_KG = 7700; // ~énergie d'1 kg de masse

export interface ProfileLite {
  weight?: number;        // kg actuel
  targetWeight?: number;  // kg objectif
  goal?: string;          // 'lose' | 'gain' | 'maintain'
  dailyCalories?: number; // cible quotidienne (kcal)
}

/** Maintenance (TDEE) estimée à partir de la cible + l'objectif. */
export function estimateTDEE(p: ProfileLite): number {
  const target = p.dailyCalories || 2000;
  if (p.goal === 'lose') return target + 500;   // la cible est un déficit
  if (p.goal === 'gain') return target - 300;    // la cible est un surplus
  if (p.weight) return Math.round(p.weight * 31); // fallback maintien ≈ 31 kcal/kg
  return target;
}

/** Variation de poids (kg) si on mange `intake` kcal/j pendant `days` jours. */
export function projectWeight(p: ProfileLite, intake: number, days: number): number {
  const tdee = estimateTDEE(p);
  const deltaKg = ((intake - tdee) * days) / KCAL_PER_KG;
  const start = p.weight || 70;
  return Math.round((start + deltaKg) * 10) / 10;
}

/** Rythme hebdo (kg/sem) à la cible actuelle (négatif = perte). */
export function weeklyRate(p: ProfileLite): number {
  const tdee = estimateTDEE(p);
  const target = p.dailyCalories || tdee;
  return Math.round((((target - tdee) * 7) / KCAL_PER_KG) * 100) / 100;
}

/** Semaines estimées pour atteindre l'objectif de poids (null si N/A). */
export function weeksToGoal(p: ProfileLite): number | null {
  if (!p.weight || !p.targetWeight) return null;
  const diff = p.targetWeight - p.weight; // négatif = à perdre
  const rate = weeklyRate(p);
  if (Math.abs(rate) < 0.01) return null;
  if (Math.sign(diff) !== Math.sign(rate)) return null; // la cible va dans le mauvais sens
  return Math.max(1, Math.ceil(Math.abs(diff) / Math.abs(rate)));
}
